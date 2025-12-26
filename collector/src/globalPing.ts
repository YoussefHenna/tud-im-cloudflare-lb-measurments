import { CollectorResult } from "./types";
import { Globalping } from 'globalping';
import { getArgs, getTraceUrl, parseTraceResult, getResultFilePath, saveResultsToCsv } from "./utils";

const CLOUDFLARE_LB_PATH = '/cdn-cgi/trace';
/*
From GlobalPing docs:
- HTTP: HTTP/1.1 without TLS
- HTTPS: HTTP/1.1 with TLS
- HTTP2: HTTP/2 with TLS
*/
const PROTOCOL = 'HTTP2';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function processMeasurementResult(
  globalping: Globalping<false>,
  measurementId: string
): Promise<CollectorResult> {
  const result = await globalping.awaitMeasurement(measurementId);
  if (!result.ok) {
    throw new Error(`Failed to await measurement (${measurementId}): ${result.data.error.message}`);
  }

  Globalping.assertMeasurementType('http', result.data);
  const results = result.data.results;

  if (results.length === 0) {
    throw new Error(`Measurement (${measurementId}) returned no results`);
  }

  // We assume 1 probe per measurement due to 'limit: 1' or reusing rootID
  const httpResult = results[0].result;
  const probeInfo = results[0].probe;

  if (httpResult.status !== 'finished') {
    throw new Error(`Measurement (${measurementId}) did not finish: ${httpResult.status}`);
  }

  const body = httpResult.rawBody;
  if (!body) {
    throw new Error(`Measurement (${measurementId}) did not return a trace`);
  }

  const traceResult = parseTraceResult(body);
  traceResult.clientCountry = probeInfo.country;
  traceResult.clientCity = probeInfo.city;
  traceResult.clientAsn = String(probeInfo.asn);
  traceResult.clientNetwork = probeInfo.network;

  return traceResult;
}

async function createRootMeasurement(
  globalping: Globalping<false>,
  host: string,
  location: string,
  outputFile: string
): Promise<string | null> {
  console.log(`Creating root measurement for ${location}...`);
  const measurement = await globalping.createMeasurement({
    type: 'http',
    target: host,
    measurementOptions: {
      request: { path: CLOUDFLARE_LB_PATH, method: 'GET' },
      protocol: PROTOCOL,
    },
    locations: [{ magic: location, limit: 1 }]
  });

  if (!measurement.ok) {
    if (measurement.data.error.type === 'rate_limit_exceeded') {
      console.log("Rate limit exceeded creating root measurement. Waiting 5s...");
      await sleep(5000);
      return null;
    }
    throw new Error(`Failed to create root measurement: ${measurement.data.error.message}`);
  }

  const rootID = measurement.data.id;
  console.log(`Root measurement created: ${rootID}`);

  // Process root measurement result
  const rootResult = await processMeasurementResult(globalping, rootID);
  saveResultsToCsv([rootResult], outputFile, true);

  return rootID;
}

async function collectFromLocation(
  globalping: Globalping<false>,
  host: string,
  location: string,
  totalRequests: number,
  outputFile: string
): Promise<void> {
  console.log(`Starting collection for ${host} from ${location} (Target: ${totalRequests} requests)`);

  let rootID: string | null = null;
  let requestsDone = 0;

  while (requestsDone < totalRequests) {
    const limits = await globalping.getLimits();
    if (!limits.ok) {
      console.warn("Failed to get limits, waiting 5s...");
      await sleep(5000);
      continue;
    }

    const createLimit = limits.data.rateLimit.measurements.create;
    let localRemaining = createLimit.remaining;

    if (localRemaining <= 0) {
      const wait = createLimit.reset + 1;
      console.log(`Rate limit reached (${requestsDone}/${totalRequests} done). Waiting ${wait}s...`);
      await sleep(wait * 1000);
      continue;
    }

    // if we don't have a root measurement, create one
    if (!rootID) {
      rootID = await createRootMeasurement(globalping, host, location, outputFile);
      requestsDone++;
      if (requestsDone % 10 === 0 || requestsDone === totalRequests) {
        console.log(`Progress for ${location}: ${requestsDone}/${totalRequests}`);
      }

      // Consume one limit manually since we just created a measurement (or tried to)
      localRemaining--;
      continue;
    }

    console.log(`Rate limit allows ${localRemaining} requests. Proceeding with batch using rootID ${rootID}...`);

    // Inner loop to consume available limits
    while (localRemaining > 0 && requestsDone < totalRequests && rootID) {
      try {
        const measurement = await globalping.createMeasurement({
          type: 'http',
          target: host,
          measurementOptions: {
            request: { path: CLOUDFLARE_LB_PATH, method: 'GET' },
            protocol: PROTOCOL,
          },
          locations: rootID,
        });

        if (!measurement.ok) {
          if (measurement.data.error.type === 'rate_limit_exceeded') {
            console.log("Rate limit exceeded during batch. Refreshing limits...");
            localRemaining = 0; // Force break to outer loop catch
            break;
          }
          if (Globalping.isHttpStatus(422, measurement)) {
            // No matching probes available (probe likely went offline)
            console.log("Root probe unavailable (422). Invalidating rootID...");
            rootID = null;
            break; // Break inner loop to recreate root
          }
          console.warn(`Failed to create measurement: ${measurement.data.error.message}`);
          await sleep(1000); // Short backoff on error
          localRemaining--; // Assume wasted attempt
          continue;
        }

        // Limit consumed
        localRemaining--;

        const result = await processMeasurementResult(globalping, measurement.data.id);
        if (result) {
          saveResultsToCsv([result], outputFile, true);
          requestsDone++;
          if (requestsDone % 10 === 0 || requestsDone === totalRequests) {
            console.log(`Progress for ${location}: ${requestsDone}/${totalRequests}`);
          }
        }

      } catch (e) {
        console.error("Error in batch loop:", e);
        await sleep(1000);
        localRemaining--;
      }
    }
  }
}

async function run() {
  const args = getArgs();

  if (!args.hosts || args.hosts.length === 0) {
    console.error("No hosts provided");
    process.exit(1);
  }

  if (!args.globalPingApiKeys || args.globalPingApiKeys.length === 0) {
    console.error("No GlobalPing API keys provided");
    process.exit(1);
  }

  if (!args.locations || args.locations.length === 0) {
    console.error("No locations provided");
    process.exit(1);
  }

  const globalping = new Globalping({
    auth: args.globalPingApiKeys[0],
  });

  const runs = args.numberOfRuns || 1;
  const outputFile = getResultFilePath();
  console.log(`Saving results to: ${outputFile}`);

  // Initialize file with header
  saveResultsToCsv([], outputFile, false);

  for (const host of args.hosts) {
    // Iterate over all provided locations separately
    for (const location of args.locations) {
      try {
        await collectFromLocation(
          globalping,
          host,
          location,
          runs,
          outputFile
        );
      } catch (e) {
        console.error(`Failed to collect from location ${location} for host ${host}:`, e);
      }
    }
  }
}

run();
