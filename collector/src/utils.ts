import fs from "node:fs";
import type { Args, CollectorResult } from "./types";
import Globalping from "globalping";

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

export function saveResultsToCsv(
  results: CollectorResult[],
  filePath: string,
  append: boolean = true,
): void {
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

  content +=
    results
      .map((result) => headerKeys.map((key) => result[key] ?? "null").join(","))
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

export const CLOUDFLARE_LB_PATH = "/cdn-cgi/trace";
/*
From GlobalPing docs:
- HTTP: HTTP/1.1 without TLS
- HTTPS: HTTP/1.1 with TLS
- HTTP2: HTTP/2 with TLS
*/
export const PROTOCOL = "HTTP2";

export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function processMeasurementResults(
  globalping: Globalping<false>,
  measurementId: string,
): Promise<CollectorResult[]> {
  const result = await globalping.awaitMeasurement(measurementId);
  if (!result.ok) {
    throw new Error(
      `Failed to await measurement (${measurementId}): ${result.data.error.message}`,
    );
  }

  Globalping.assertMeasurementType("http", result.data);
  const results = result.data.results;

  if (results.length === 0) {
    throw new Error(`Measurement (${measurementId}) returned no results`);
  }

  const parsedResults = await Promise.all(
    results.map(async (result) => {
      const httpResult = result.result;
      const probeInfo = result.probe;

      if (httpResult.status !== "finished") {
        throw new Error(
          `Measurement (${measurementId}) did not finish: ${httpResult.status}`,
        );
      }

      const body = httpResult.rawBody;
      if (!body) {
        throw new Error(
          `Measurement (${measurementId}) did not return a trace`,
        );
      }

      const traceResult = parseTraceResult(body);
      traceResult.clientCountry = probeInfo.country;
      traceResult.clientCity = probeInfo.city;
      traceResult.clientAsn = String(probeInfo.asn);
      traceResult.clientNetwork = probeInfo.network;

      traceResult.latencyTotal = String(httpResult.timings.total);
      traceResult.latencyDNS = String(httpResult.timings.dns);
      traceResult.latencyTCP = String(httpResult.timings.tcp);
      traceResult.latencyTLS = String(httpResult.timings.tls);
      traceResult.latencyFirstByte = String(httpResult.timings.firstByte);
      traceResult.latencyDownload = String(httpResult.timings.download);

      return traceResult;
    }),
  );

  return parsedResults;
}
