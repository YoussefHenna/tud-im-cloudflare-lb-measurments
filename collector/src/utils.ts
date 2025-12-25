import fs from "node:fs";
import type { Args, CollectorResult } from "./types";

export function getTraceUrl(host: string): string {
  return `${host}/cdn-cgi/trace`;
}

export function parseTraceResult(result: string): CollectorResult {
  const collectorResult: CollectorResult = {
    timestamp: null,

    balancerId: null,
    balancerIp: null,
    balancerCountry: null,
    balancerColocationCenter: null,

    targetDomain: null,
    scheme: null,
    httpVersion: null,
    tlsVersion: null,

    clientCountry: null,
    clientCity: null,
    clientAsn: null,
    clientNetwork: null,
  };

  const keyMapping: Record<string, keyof CollectorResult> = {
    fl: "balancerId",
    h: "targetDomain",
    ip: "balancerIp",
    ts: "timestamp",
    visit_scheme: "scheme",
    colo: "balancerColocationCenter",
    http: "httpVersion",
    loc: "balancerCountry",
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
  const filePath = getResultFilePath();
  saveResultsToCsv(results, filePath);
}

export function getResultFilePath(): string {
  const timestamp = new Date().getTime();
  const directory = "results";
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory);
  }
  return `${directory}/${timestamp}_results.csv`;
}

export function saveResultsToCsv(results: CollectorResult[], filePath: string, append: boolean = true): void {
  if (results.length === 0) {
    return;
  }

  // Define header order to ensure consistency
  // Note: This must match the keys in CollectorResult
  const headerKeys: (keyof CollectorResult)[] = [
    "timestamp",
    "balancerId",
    "balancerIp",
    "balancerCountry",
    "balancerColocationCenter",
    "targetDomain",
    "scheme",
    "httpVersion",
    "tlsVersion",
    "clientCountry",
    "clientCity",
    "clientAsn",
    "clientNetwork"
  ];

  let content = "";

  if (!append || !fs.existsSync(filePath)) {
    content += headerKeys.join(",") + "\n";
  }

  content += results
    .map((result) =>
      headerKeys
        .map((key) => result[key] ?? "null")
        .join(",")
    )
    .join("\n") + "\n";

  fs.appendFileSync(filePath, content);
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
