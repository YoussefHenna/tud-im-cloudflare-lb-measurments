import { CollectorResult } from "./types";
import { Globalping, Probe, ProbeLocation } from "globalping";
import {
  getArgs,
  getTraceUrl,
  parseTraceResult,
  getResultFilePath,
  saveResultsToCsv,
  sleep,
  processMeasurementResults,
  CLOUDFLARE_LB_PATH,
  PROTOCOL,
} from "./utils";

async function createMeasurement(
  globalping: Globalping<false>,
  host: string,
  location: ProbeLocation,
  outputFile: string,
): Promise<string | null> {
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
    console.error(
      `Failed to create measurement: ${measurement.data.error.message}`,
    );
    return null;
  }

  const rootID = measurement.data.id;

  // Process root measurement result
  const results = await processMeasurementResults(globalping, rootID);
  saveResultsToCsv(results, outputFile, true);

  return rootID;
}

async function collectFromLocation(
  globalping: Globalping<false>,
  host: string,
  location: string | null,
  outputFile: string,
  availableProbes: Probe[],
): Promise<void> {
  const probesOfLocation = location
    ? availableProbes.filter(
      (probe) =>
        probe.location.asn.toString() === location ||
        probe.location.city === location ||
        probe.location.country === location ||
        probe.location.region === location ||
        probe.location.continent === location,
    )
    : availableProbes;

  console.log(
    `Starting collection for ${host} from ${location ?? "All locations"} (Target: ${probesOfLocation.length} requests)`,
  );

  let requestsDone = 0;
  let currentProbIndex = 0;

  while (currentProbIndex < probesOfLocation.length) {
    try {
      const currentProbe = probesOfLocation[currentProbIndex];
      currentProbIndex++;

      for (let i = 0; i < 10; i++) {
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
      }
      requestsDone += 1;

      console.log(
        `Progress: ${requestsDone}/${probesOfLocation.length}`,
      );
    } catch (e) {
      console.error("Error in batch loop:", e);
      await sleep(1000);
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

  const globalping = new Globalping({
    auth: args.globalPingApiKeys[0],
  });

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
    if (!args.locations || args.locations.length === 0) {
      // No locations provided, go through all probes
      await collectFromLocation(
        globalping,
        host,
        null,
        outputFile,
        availableProbes.data,
      );
    } else {
      // Iterate over all provided locations separately
      for (const location of args.locations) {
        try {
          await collectFromLocation(
            globalping,
            host,
            location,
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
  }

  console.log("All measurements completed");
}

run();
