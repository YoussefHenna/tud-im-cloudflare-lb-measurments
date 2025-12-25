export interface CollectorResult {
  timestamp: string | null;

  balancerId: string | null;
  balancerIp: string | null;
  balancerCountry: string | null;
  balancerColocationCenter: string | null;

  targetDomain: string | null;
  scheme: string | null;
  httpVersion: string | null;
  tlsVersion: string | null;

  clientCountry: string | null;
  clientCity: string | null;
  clientAsn: string | null;
  clientNetwork: string | null;
}

export interface Args {
  hosts?: string[];
  numberOfRuns?: number;
  useHttp3?: boolean;
  globalPingApiKeys?: string[];
  locations?: string[];
}
