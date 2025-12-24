import { CollectorResult } from "./types";
import { execFileSync } from "node:child_process";
import { getArgs, getTraceUrl, parseTraceResult, saveToFile } from "./utils";

function globalPingCollect({
  host,
  apiKeys,
  locations,
}: {
  host: string;
  apiKeys: string[];
  locations: string[];
}): CollectorResult[] {
  const results: CollectorResult[] = [];

  //TODO: Implement global ping collection

  return results;
}

function run() {
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

  const accumulatedResults: CollectorResult[] = [];

  for (const host of args.hosts) {
    const results = globalPingCollect({
      host,
      apiKeys: args.globalPingApiKeys,
      locations: args.locations,
    });
    accumulatedResults.push(...results);
  }

  saveToFile(accumulatedResults);
}

run();
