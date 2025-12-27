import { CollectorResult } from "./types";
import { Globalping, Probe, ProbeLocation } from "globalping";
import {
  getArgs,
  getTraceUrl,
  parseTraceResult,
  getResultFilePath,
  saveResultsToCsv,
} from "./utils";
import {
  PROTOCOL,
  sleep,
  processMeasurementResults,
  CLOUDFLARE_LB_PATH,
} from "./globalPing";
import { uniqBy } from "lodash";

async function createMeasurement(
  globalping: Globalping<false>,
  host: string,
  location: ProbeLocation,
  outputFile: string,
): Promise<string | null> {
  console.log(
    `Creating measurement for ${location.city} - ${location.network}...`,
  );

  const measurement = await globalping.createMeasurement({
    type: "http",
    target: host,
    measurementOptions: {
      request: { path: CLOUDFLARE_LB_PATH, method: "GET" },
      protocol: PROTOCOL,
    },
    locations: [
      {
        city: location.city,
        network: location.network,
        limit: 1,
      },
    ],
  });

  if (!measurement.ok) {
    if (measurement.data.error.type === "rate_limit_exceeded") {
      console.log("Rate limit exceeded creating measurement. Waiting 5s...");
      return null;
    }
    throw new Error(
      `Failed to create measurement: ${measurement.data.error.message}`,
    );
  }

  const rootID = measurement.data.id;
  console.log(`Root measurement created: ${rootID}`);

  // Process root measurement result
  const results = await processMeasurementResults(globalping, rootID);
  saveResultsToCsv(results, outputFile, true);

  return rootID;
}

async function collectFromLocation(
  globalping: Globalping<false>,
  host: string,
  location: string,
  totalRequests: number,
  outputFile: string,
  availableProbes: Probe[],
): Promise<void> {
  console.log(
    `Starting collection for ${host} from ${location} (Target: ${totalRequests} requests)`,
  );

  let requestsDone = 0;
  let currentProbIndex = 0;

  const probesOfLocation = uniqBy(
    availableProbes.filter(
      (probe) =>
        probe.location.asn.toString() === location ||
        probe.location.city === location ||
        probe.location.country === location ||
        probe.location.region === location ||
        probe.location.continent === location,
    ),
    // Limit to only one probe per same city and network
    (probe) => probe.location.city + probe.location.network,
  );

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

    // Inner loop to consume available limits
    while (localRemaining > 0 && requestsDone < totalRequests) {
      try {
        const currentProbe = probesOfLocation[currentProbIndex];

        currentProbIndex++;
        if (currentProbIndex >= probesOfLocation.length) {
          currentProbIndex = 0;
        }

        const measurementID = await createMeasurement(
          globalping,
          host,
          currentProbe.location,
          outputFile,
        );
        if (!measurementID) {
          console.log("Failed to create measurement, waiting 5s...");
          await sleep(5000);
          continue;
        }
        requestsDone += 1;
        if (requestsDone % 10 === 0 || requestsDone === totalRequests) {
          console.log(
            `Progress for ${location}: ${requestsDone}/${totalRequests}`,
          );
        }

        // Consume limit since we just created a measurement (or tried to)
        localRemaining -= 1;
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

  const availableProbes = await globalping.listProbes();
  if (!availableProbes.ok) {
    console.error("Failed to list probes:", availableProbes.data);
    process.exit(1);
  }

  for (const host of args.hosts) {
    // Iterate over all provided locations separately
    for (const location of args.locations) {
      try {
        await collectFromLocation(
          globalping,
          host,
          location,
          runs,
          outputFile,
          availableProbes.data,
        );
      } catch (e) {
        console.error(
          `Failed to collect from location ${location} for host ${host}:`,
          e,
        );
      }
    }
  }

  console.log("All measurements completed");
}

run();
