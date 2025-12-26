import { CollectorResult } from "./types";
import { Globalping } from 'globalping';
import { getArgs, getTraceUrl, parseTraceResult, getResultFilePath, getLogFilePath, saveResultsToCsv, distributeList, Logger } from "./utils";

const CLOUDFLARE_LB_PATH = '/cdn-cgi/trace';
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

  traceResult.latencyTotal = String(httpResult.timings.total);
  traceResult.latencyDNS = String(httpResult.timings.dns);
  traceResult.latencyTCP = String(httpResult.timings.tcp);
  traceResult.latencyTLS = String(httpResult.timings.tls);
  traceResult.latencyFirstByte = String(httpResult.timings.firstByte);
  traceResult.latencyDownload = String(httpResult.timings.download);

  return traceResult;
}

async function createRootMeasurement(
  globalping: Globalping<false>,
  host: string,
  location: string,
  outputFile: string,
  logger: Logger
): Promise<string | null> {
  logger.log(`Creating root measurement for ${location}...`);
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
      logger.warn("Rate limit exceeded creating root measurement. Waiting 5s...");
      return null;
    }
    throw new Error(`Failed to create root measurement: ${measurement.data.error.message}`);
  }

  const rootID = measurement.data.id;
  logger.log(`Root measurement created: ${rootID}`);

  // Process root measurement result
  const rootResult = await processMeasurementResult(globalping, rootID);
  saveResultsToCsv([rootResult], outputFile, true);

  return rootID;
}

async function collectFromLocation(
  apiKey: string,
  host: string,
  location: string,
  totalRequests: number,
  outputFile: string
): Promise<void> {
  const logFile = getLogFilePath(location);
  const logger = new Logger(logFile);

  logger.log(`Starting collection for ${host} from ${location} (Target: ${totalRequests} requests)`);
  logger.log(`Using API key ending in ...${apiKey.slice(-5)}`);
  logger.log(`Results will be saved to ${outputFile}`);
  logger.log(`Logs will be saved to ${logFile}`);

  const globalping = new Globalping({ auth: apiKey });

  // Initialize file with header if needed
  saveResultsToCsv([], outputFile, false);

  let rootID: string | null = null;
  let requestsDone = 0;

  while (requestsDone < totalRequests) {
    const limits = await globalping.getLimits();
    if (!limits.ok) {
      logger.warn("Failed to get limits, waiting 5s...");
      await sleep(5000);
      continue;
    }

    const createLimit = limits.data.rateLimit.measurements.create;
    let localRemaining = createLimit.remaining;

    if (localRemaining <= 0) {
      const wait = createLimit.reset + 1;
      logger.log(`Rate limit reached (${requestsDone}/${totalRequests} done). Waiting ${wait}s...`);
      await sleep(wait * 1000);
      continue;
    }

    // if we don't have a root measurement, create one
    if (!rootID) {
      try {
        rootID = await createRootMeasurement(globalping, host, location, outputFile, logger);
        if (!rootID) {
          await sleep(5000); // Backoff if it returned null (rate limited)
          continue;
        }

        requestsDone++;
        if (requestsDone % 10 === 0 || requestsDone === totalRequests) {
          logger.log(`Progress for ${location}: ${requestsDone}/${totalRequests}`);
        }

        // Consume one limit manually since we just created a measurement
        localRemaining--;
        continue;
      } catch (e: any) {
        logger.error(`Error creating root measurement: ${e.message}`);
        await sleep(5000);
        continue;
      }
    }

    logger.log(`Rate limit allows ${localRemaining} requests. Proceeding with batch using rootID ${rootID}...`);

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
            logger.log("Rate limit exceeded during batch. Refreshing limits...");
            localRemaining = 0;
            break;
          }
          if (Globalping.isHttpStatus(422, measurement)) {
            logger.log("Root probe unavailable (422). Invalidating rootID...");
            rootID = null;
            break;
          }
          logger.warn(`Failed to create measurement: ${measurement.data.error.message}`);
          await sleep(1000);
          localRemaining--;
          continue;
        }

        localRemaining--;

        const result = await processMeasurementResult(globalping, measurement.data.id);
        if (result) {
          saveResultsToCsv([result], outputFile, true);
          requestsDone++;
          if (requestsDone % 10 === 0 || requestsDone === totalRequests) {
            logger.log(`Progress for ${location}: ${requestsDone}/${totalRequests}`);
          }
        }

      } catch (e: any) {
        logger.error(`Error in batch loop: ${e.message}`);
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

  const runs = args.numberOfRuns || 1;

  const keys = args.globalPingApiKeys;
  const locationBuckets = distributeList(args.locations, keys.length);

  const promises: Promise<void>[] = [];

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const locationsForKey = locationBuckets[i];

    if (locationsForKey.length === 0) continue;

    const threadPromise = (async () => {
      for (const location of locationsForKey) {
        for (const host of args.hosts!) {
          const outputFile = getResultFilePath(location);
          try {
            await collectFromLocation(key, host, location, runs, outputFile);
          } catch (e) {
            console.error(`CRITICAL FAILURE for location ${location}:`, e);
          }
        }
      }
    })();
    promises.push(threadPromise);
  }

  await Promise.all(promises);
  console.log("All measurements completed");
}

run();
