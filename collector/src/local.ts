import { CollectorResult } from "./types";
import { execFileSync } from "node:child_process";
import { getArgs, getTraceUrl, parseTraceResult, saveToFile } from "./utils";

function localCollect({
  host,
  numberOfRuns,
  useHttp3,
}: {
  host: string;
  numberOfRuns: number;
  useHttp3: boolean;
}): CollectorResult[] {
  const results: CollectorResult[] = [];

  for (let i = 0; i < numberOfRuns; i++) {
    const curlOptions = [useHttp3 ? "--http3" : "--http2", getTraceUrl(host)];

    const result = execFileSync("curl", curlOptions).toString();
    const parsedResult = parseTraceResult(result);
    results.push(parsedResult);
  }

  return results;
}

function run() {
  const args = getArgs();

  if (!args.hosts || args.hosts.length === 0) {
    console.error("No hosts provided");
    process.exit(1);
  }

  const accumulatedResults: CollectorResult[] = [];

  for (const host of args.hosts) {
    const results = localCollect({
      host,
      numberOfRuns: args.numberOfRuns ?? 1,
      useHttp3: args.useHttp3 ?? false,
    });
    accumulatedResults.push(...results);
  }

  saveToFile(accumulatedResults);
}

run();
