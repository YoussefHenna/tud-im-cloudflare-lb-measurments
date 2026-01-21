import { CollectorResult } from "./types";
import { Globalping } from "globalping";
import {
  getArgs,
  getTraceUrl,
  parseTraceResult,
  getResultFilePath,
  saveResultsToCsv,
  CLOUDFLARE_LB_PATH,
  processMeasurementResults,
  PROTOCOL,
  sleep,
} from "./utils";

async function createRootMeasurement(
  globalping: Globalping<false>,
  host: string,
  location: string,
  outputFile: string,
): Promise<string | null> {
  console.log(`Creating root measurement for ${location}...`);
  const measurement = await globalping.createMeasurement({
    type: "http",
    target: host,
    measurementOptions: {
      request: { path: CLOUDFLARE_LB_PATH, method: "GET" },
      protocol: PROTOCOL,
    },
    locations: [{ magic: location, limit: 1 }],
  });

  if (!measurement.ok) {
    if (measurement.data.error.type === "rate_limit_exceeded") {
      console.log(
        "Rate limit exceeded creating root measurement. Waiting 5s...",
      );
      return null;
    }
    throw new Error(
      `Failed to create root measurement: ${measurement.data.error.message}`,
    );
  }

  const rootID = measurement.data.id;
  console.log(`Root measurement created: ${rootID}`);

  // Process root measurement result
  const rootResults = await processMeasurementResults(globalping, rootID);
  saveResultsToCsv(rootResults, outputFile, true);

  return rootID;
}

async function collectFromLocation(
  globalping: Globalping<false>,
  host: string,
  location: string,
  totalRequests: number,
  outputFile: string,
): Promise<void> {
  console.log(
    `Starting collection for ${host} from ${location} (Target: ${totalRequests} requests)`,
  );

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
      console.log(
        `Rate limit reached (${requestsDone}/${totalRequests} done). Waiting ${wait}s...`,
      );
      await sleep(wait * 1000);
      continue;
    }

    // if we don't have a root measurement, create one
    if (!rootID) {
      rootID = await createRootMeasurement(
        globalping,
        host,
        location,
        outputFile,
      );
      if (!rootID) {
        console.log("Failed to create root measurement, waiting 5s...");
        await sleep(5000);
        continue;
      }
      requestsDone++;
      if (requestsDone % 10 === 0 || requestsDone === totalRequests) {
        console.log(
          `Progress for ${location}: ${requestsDone}/${totalRequests}`,
        );
      }

      // Consume one limit manually since we just created a measurement (or tried to)
      localRemaining--;
      continue;
    }

    console.log(
      `Rate limit allows ${localRemaining} requests. Proceeding with batch using rootID ${rootID}...`,
    );

    // Inner loop to consume available limits
    while (localRemaining > 0 && requestsDone < totalRequests && rootID) {
      try {
        const measurement = await globalping.createMeasurement({
          type: "http",
          target: host,
          measurementOptions: {
            request: { path: CLOUDFLARE_LB_PATH, method: "GET" },
            protocol: PROTOCOL,
          },
          locations: rootID,
        });

        if (!measurement.ok) {
          if (measurement.data.error.type === "rate_limit_exceeded") {
            console.log(
              "Rate limit exceeded during batch. Refreshing limits...",
            );
            localRemaining = 0; // Force break to outer loop catch
            break;
          }
          if (Globalping.isHttpStatus(422, measurement)) {
            // No matching probes available (probe likely went offline)
            console.log("Root probe unavailable (422). Invalidating rootID...");
            rootID = null;
            break; // Break inner loop to recreate root
          }
          console.warn(
            `Failed to create measurement: ${measurement.data.error.message}`,
          );
          await sleep(1000); // Short backoff on error
          localRemaining--; // Assume wasted attempt
          continue;
        }

        // Limit consumed
        localRemaining--;

        const results = await processMeasurementResults(
          globalping,
          measurement.data.id,
        );
        if (results) {
          saveResultsToCsv(results, outputFile, true);
          requestsDone++;
          if (requestsDone % 10 === 0 || requestsDone === totalRequests) {
            console.log(
              `Progress for ${location}: ${requestsDone}/${totalRequests}`,
            );
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

async function runWorker(
  apiKey: string,
  locations: string[],
  hosts: string[],
  totalRequests: number,
  outputFile: string,
) {
  const globalping = new Globalping({
    auth: apiKey,
  });

  for (const host of hosts) {
    for (const location of locations) {
      try {
        await collectFromLocation(
          globalping,
          host,
          location,
          totalRequests,
          outputFile,
        );
      } catch (e) {
        console.error(
          `[${apiKey.slice(0, 5)}...] Failed to collect from location ${location} for host ${host}:`,
          e,
        );
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
  const outputFile = getResultFilePath();
  console.log(`Saving results to: ${outputFile}`);

  // Initialize file with header
  saveResultsToCsv([], outputFile, false);

  const apiKeys = args.globalPingApiKeys;
  const locations = args.locations;

  // Split locations among API keys
  const chunks: string[][] = Array.from({ length: apiKeys.length }, () => []);
  locations.forEach((loc, index) => {
    chunks[index % apiKeys.length].push(loc);
  });

  console.log(
    `Distributing ${locations.length} locations among ${apiKeys.length} clients`,
  );

  const promises = apiKeys.map((key, index) => {
    const workerLocations = chunks[index];
    if (workerLocations.length === 0) {
      return Promise.resolve();
    }
    console.log(
      `Client ${index + 1} (${key.slice(0, 5)}...) assigned ${workerLocations.length} locations`,
    );
    return runWorker(key, workerLocations, args.hosts!, runs, outputFile);
  });

  await Promise.all(promises);

  console.log("All measurements completed");
}

run();
