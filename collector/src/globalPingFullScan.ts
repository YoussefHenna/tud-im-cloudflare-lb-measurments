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

const MIN_REQUESTS_THRESHOLD = 300;
const BACK_OFF_EVERY_N_REQUESTS = 5_000; // 5 seconds
const BACK_OFF_TIME = 60_000; // 1 minute
const MAX_CONSECUTIVE_FAILURES = 5;

class ColocationStats {
  uniqueBalancers: Set<string> = new Set();
  requestsSinceLastNew: number = 0;

  // Colocation is covered if we made enough requests after last found balancer ID:
  // Both with minimal threshold and curent dynamic threshold (count of already found balancers).
  isCovered(): boolean {
    return this.requestsSinceLastNew > Math.max(MIN_REQUESTS_THRESHOLD, this.uniqueBalancers.size);
  }
};

const colocationsStats = new Map<string, ColocationStats>();

async function createMeasurement(
  globalping: Globalping<false>,
  host: string,
  location: ProbeLocation,
  outputFile: string,
): Promise<CollectorResult[] | null> {
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
  saveResultsToCsv(results, outputFile, true);

  return results;
}

async function getAndWaitForLimits(
  globalping: Globalping<false>,
): Promise<number> {
  while (true) {
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
      console.log(`Rate limit reached. Waiting ${wait}s...`);
      await sleep(wait * 1000);
      continue;
    }

    return localRemaining;
  }
}

function addResultToSeenIds(seenColocationsByVP: Set<string>, result: CollectorResult): {
  shouldContinue: boolean;
} {
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

  let shouldContinue = false;
  // Iterate over all colocations seen by current vantage point
  // And if ALL of them are covered, stop measurement.
  for (const seenColocation in seenColocationsByVP.entries) {
    const seenStats = colocationsStats.get(seenColocation)!;
    if (!seenStats.isCovered()) {
      shouldContinue = true;
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

  const moveToNextProbe = () => {
    currentRequestsDone = 0;
    currentProbeIndex++;
    consecutiveFailures = 0;
    seenColocations = new Set<string>;
  };

  while (currentProbeIndex < availableProbes.length) {
    let localRemaining = await getAndWaitForLimits(globalping);

    // Inner loop to consume available limits
    while (localRemaining > 0 && currentProbeIndex < availableProbes.length) {
      try {
        const currentProbe = availableProbes[currentProbeIndex];

        const results = await createMeasurement(
          globalping,
          host,
          currentProbe.location,
          outputFile,
        );

        currentRequestsDone++;
        totalRequestsDone++;
        localRemaining--;

        if (totalRequestsDone % BACK_OFF_EVERY_N_REQUESTS === 0) {
          console.log(`Backing off after ${totalRequestsDone} requests...`);
          await sleep(BACK_OFF_TIME);
        }

        if (!results) {
          consecutiveFailures++;

          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            console.log(
              `Max consecutive failures for probe reached, moving to next probe ${currentProbeIndex + 1} of ${availableProbes.length}`,
            );
            moveToNextProbe();
            continue;
          }

          console.log("Failed to create measurement, waiting 5s...");
          await sleep(5000);
          continue;
        }
        const result = results[0]!;
        seenColocations.add(result.balancerColocationCenter!);
        const { shouldContinue } = addResultToSeenIds(seenColocations, result);

        if (currentRequestsDone > MIN_REQUESTS_THRESHOLD && !shouldContinue) {
          console.log(
            `No new IDs found after, moving to next probe ${currentProbeIndex + 1} of ${availableProbes.length}`,
          );
          moveToNextProbe();
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
