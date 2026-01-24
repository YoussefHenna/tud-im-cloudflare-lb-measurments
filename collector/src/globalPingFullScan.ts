import { CollectorResult } from "./types";
import { Globalping, Probe, ProbeLocation } from "globalping";
import {
  getArgs,
  getResultFilePath,
  saveResultsToCsv,
  sleep,
  processMeasurementResults,
  CLOUDFLARE_LB_PATH,
  PROTOCOL,
} from "./utils";
import fs from "fs/promises";

const PARALLEL_REQUESTS = 10;

const MIN_REQUESTS_THRESHOLD_PER_COL = 300;
const MIN_REQUESTS_THRESHOLD_PER_PROBE = 20;

const MAX_CONSECUTIVE_FAILURES = 5;

class ColocationStats {
  uniqueBalancers: Set<string> = new Set();
  requestsSinceLastNew: number = 0;

  // Colocation is covered if we made enough requests after last found balancer ID:
  // Both with minimal threshold and curent dynamic threshold (count of already found balancers).
  isCovered(): boolean {
    return this.requestsSinceLastNew > Math.max(MIN_REQUESTS_THRESHOLD_PER_COL, 2 * this.uniqueBalancers.size);
  }
};

const colocationsStats = new Map<string, ColocationStats>();

async function createMeasurement(
  globalping: Globalping<false>,
  host: string,
  location: ProbeLocation,
): Promise<CollectorResult[] | null> {
  const measurement = await globalping.createMeasurement({
    type: "http",
    target: host,
    measurementOptions: {
      request: { path: CLOUDFLARE_LB_PATH, method: "GET" },
      protocol: PROTOCOL,
    },
    locations: [
      {
        country: location.country,
        city: location.city,
        network: location.network,
        limit: 1,
      },
    ],
  });

  if (!measurement.ok) {
    if (measurement.data.error.type === "rate_limit_exceeded") {
      console.log("Rate limit exceeded creating measurement....");
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

  return results;
}

function addResultsToSeenIds(seenColocationsByVP: Set<string>, results: CollectorResult[]): {
  shouldContinue: boolean;
} {
  let shouldContinue = false;
  for (const result of results) {
    const balancerId = result.balancerId!;
    const colocation = result.balancerColocationCenter!;

    // Init value for colocation stats
    if (!colocationsStats.has(colocation)) {
      colocationsStats.set(colocation, new ColocationStats);
    }

    // Update value for colocation stats
    let stats = colocationsStats.get(colocation)!
    if (stats.uniqueBalancers.has(balancerId)) {
      stats.requestsSinceLastNew++;
    } else {
      stats.uniqueBalancers.add(balancerId);
      stats.requestsSinceLastNew = 0;
    }

    // Iterate over all colocations seen by current vantage point
    // And if ALL of them are covered, stop measurement.
    for (const seenColocation of Array.from(seenColocationsByVP.keys())) {
      const seenStats = colocationsStats.get(seenColocation)!;
      if (!seenStats.isCovered()) {
        shouldContinue = true;
      }
    }
  }

  return { shouldContinue };
}

function prepareOutputFile(): string {
  const outputFile = getResultFilePath();
  console.log(`Saving results to: ${outputFile}`);
  saveResultsToCsv([], outputFile, false);
  return outputFile;
}

async function collectForHost(
  globalping: Globalping<false>,
  host: string,
  availableProbes: Probe[],
): Promise<void> {
  console.log(
    `Starting collection for ${host} (Target: ${availableProbes.length} probes)`,
  );

  let currentRequestsDone = 0;
  let totalRequestsDone = 0;
  let consecutiveFailures = 0;
  let currentProbeIndex = 0;
  let seenColocations = new Set<string>;

  let outputFile = prepareOutputFile();
  let progressFile = "full_scan_progress.txt"

  const moveToNextProbe = () => {
    currentRequestsDone = 0;
    currentProbeIndex++;
    consecutiveFailures = 0;
    seenColocations = new Set<string>;

    try {
      fs.writeFile(progressFile, `${currentProbeIndex}/${availableProbes.length}`, 'utf8');
    } catch (err) {
      console.error('Failed to update progress file:', err);
    }
  };

  while (currentProbeIndex < availableProbes.length) {
    try {
      const currentProbe = availableProbes[currentProbeIndex];
      const batchSize = PARALLEL_REQUESTS;

      let promises: Promise<CollectorResult[] | null>[] = [];
      for (let i = 0; i < batchSize; i++) {
        promises.push(createMeasurement(
          globalping,
          host,
          currentProbe.location,
        ));
      }

      const results = await Promise.all(promises);
      const validResults = results.filter((result): result is CollectorResult[] => result !== null).flat();

      saveResultsToCsv(validResults, outputFile, true);

      const requestsLaunched = results.length;
      currentRequestsDone += requestsLaunched;
      totalRequestsDone += requestsLaunched;

      if (validResults.length === 0) {
        consecutiveFailures++;

        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          console.log(
            `Max consecutive failures for probe reached, moving to next probe ${currentProbeIndex + 1} of ${availableProbes.length}`,
          );
          moveToNextProbe();
          continue;
        }

        console.log("Failed to create any measurements in batch, waiting 10s...");
        await sleep(10000);
        continue;
      }

      // Reset consecutive failures if we had at least one success
      consecutiveFailures = 0;

      // We need to check coverage after ALL results in this batch
      for (const result of validResults) {
        seenColocations.add(result.balancerColocationCenter!);
      }
      const { shouldContinue } = addResultsToSeenIds(seenColocations, validResults);

      if (currentRequestsDone > MIN_REQUESTS_THRESHOLD_PER_PROBE && shouldContinue) {
        console.log(
          `Coverage reached for all seen colocations, moving to next probe ${currentProbeIndex + 1} of ${availableProbes.length}`,
        );
        moveToNextProbe();
      }
    } catch (e) {
      console.error("Error in batch loop:", e);
      await sleep(5000);
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

  const availableProbes = await globalping.listProbes();
  if (!availableProbes.ok) {
    console.error("Failed to list probes:", availableProbes.data);
    process.exit(1);
  }

  for (const host of args.hosts) {
    await collectForHost(globalping, host, availableProbes.data);
  }

  console.log("All measurements completed");
}

run();
