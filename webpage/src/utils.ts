import { LoadBalancer } from "@/prisma/generated/prisma";

export const LB_COUNT_LIMIT = 50;

export function parseTraceResult(result: string): LoadBalancer {
  const loadBalancer: LoadBalancer = {
    id: "",
    ipAddress: "",
    country: "",
    colocationCenter: "",
    lastChecked: new Date(),
  };

  const keyMapping: Record<string, keyof LoadBalancer> = {
    fl: "id",
    ip: "ipAddress",
    ts: "lastChecked",
    colo: "colocationCenter",
    loc: "country",
  };

  const lines = result.split("\n");
  for (const line of lines) {
    const [key, value] = line.split("=");
    const mappedKey = keyMapping[key];
    if (mappedKey) {
      if (mappedKey === "lastChecked") {
        loadBalancer.lastChecked = new Date(value);
      } else {
        loadBalancer[mappedKey] = value;
      }
    }
  }
  return loadBalancer;
}
