export interface CollectorResult {
  balancerId: string | null;
  host: string | null;
  clientIp: string | null;
  timestamp: string | null;
  scheme: string | null;
  userAgent: string | null;
  colocationCenter: string | null;
  httpVersion: string | null;
  clientCountry: string | null;
  tlsVersion: string | null;
}

export interface Args {
  hosts?: string[];
  numberOfRuns?: number;
  useHttp3?: boolean;
  globalPingApiKeys?: string[];
  locations?: string[];
}
