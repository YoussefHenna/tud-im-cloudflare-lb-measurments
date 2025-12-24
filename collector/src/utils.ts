import fs from "node:fs";
import type { Args, CollectorResult } from "./types";

export function getTraceUrl(host: string): string {
  return `${host}/cdn-cgi/trace`;
}

export function parseTraceResult(result: string): CollectorResult {
  const collectorResult: CollectorResult = {
    balancerId: null,
    host: null,
    clientIp: null,
    timestamp: null,
    scheme: null,
    userAgent: null,
    colocationCenter: null,
    httpVersion: null,
    clientCountry: null,
    tlsVersion: null,
  };

  const keyMapping: Record<string, keyof CollectorResult> = {
    fl: "balancerId",
    h: "host",
    ip: "clientIp",
    ts: "timestamp",
    visit_scheme: "scheme",
    uag: "userAgent",
    colo: "colocationCenter",
    http: "httpVersion",
    loc: "clientCountry",
    tls: "tlsVersion",
  };

  const lines = result.split("\n");
  for (const line of lines) {
    const [key, value] = line.split("=");
    const mappedKey = keyMapping[key];
    if (mappedKey) {
      collectorResult[mappedKey] = value;
    }
  }
  return collectorResult;
}

export function saveToFile(results: CollectorResult[]): void {
  if (results.length === 0) {
    console.warn("No results to save");
    return;
  }
  const csvHeader = Object.keys(results[0]).join(",");
  const csvContent = results
    .map((result) =>
      Object.values(result)
        .map((val) => val ?? "null")
        .join(",")
    )
    .join("\n");

  const timestamp = new Date().getTime();

  const directory = "results";
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory);
  }
  fs.writeFileSync(
    `${directory}/${timestamp}_results.csv`,
    `${csvHeader}\n${csvContent}`
  );
}

export function getArgs(): Args {
  const args = require("minimist")(process.argv.slice(2));

  return {
    hosts: args.hosts?.split(","),
    numberOfRuns: args.runs,
    useHttp3: args.http3,
    globalPingApiKeys: args.keys?.split(","),
    locations: args.locations?.split(","),
  };
}
