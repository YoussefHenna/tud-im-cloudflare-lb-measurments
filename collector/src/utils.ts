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

    latencyTotal: null,
    latencyDNS: null,
    latencyTCP: null,
    latencyTLS: null,
    latencyFirstByte: null,
    latencyDownload: null,
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

export class Logger {
  private logFile: string;

  constructor(logFile: string) {
    this.logFile = logFile;
    // Create file if not exists
    if (!fs.existsSync(logFile)) {
      fs.writeFileSync(logFile, "");
    }
  }

  private write(level: string, message: string, ...args: any[]) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level}] ${message} ${args.length ? JSON.stringify(args) : ''}`;

    // Console output
    if (level === 'ERROR') {
      console.error(logMessage);
    } else if (level === 'WARN') {
      console.warn(logMessage);
    } else {
      console.log(logMessage);
    }

    // File output
    fs.appendFileSync(this.logFile, logMessage + "\n");
  }

  log(message: string, ...args: any[]) {
    this.write('INFO', message, ...args);
  }

  warn(message: string, ...args: any[]) {
    this.write('WARN', message, ...args);
  }

  error(message: string, ...args: any[]) {
    this.write('ERROR', message, ...args);
  }
}

export function distributeList<T>(items: T[], bucketCount: number): T[][] {
  const buckets: T[][] = Array.from({ length: bucketCount }, () => []);
  items.forEach((item, index) => {
    buckets[index % bucketCount].push(item);
  });
  return buckets;
}

export function saveToFile(results: CollectorResult[], filePath: string): void {
  saveResultsToCsv(results, filePath);
}

export function getResultFilePath(suffix: string = "results"): string {
  const timestamp = new Date().getTime();
  const directory = "results";
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory);
  }
  return `${directory}/${timestamp}_${suffix}.csv`;
}

export function getLogFilePath(suffix: string): string {
  const timestamp = new Date().getTime();
  const directory = "results";
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory);
  }
  return `${directory}/${timestamp}_${suffix}.log`;
}

export function saveResultsToCsv(results: CollectorResult[], filePath: string, append: boolean = true): void {
  if (results.length === 0 && append && fs.existsSync(filePath)) {
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
    "clientNetwork",
    "latencyTotal",
    "latencyDNS",
    "latencyTCP",
    "latencyTLS",
    "latencyFirstByte",
    "latencyDownload",
  ];

  let content = "";

  if (!append || !fs.existsSync(filePath)) {
    content += headerKeys.join(",") + "\n";
  }

  if (results.length > 0) {
    content += results
      .map((result) =>
        headerKeys
          .map((key) => result[key] ?? "null")
          .join(",")
      )
      .join("\n") + "\n";
  }

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
