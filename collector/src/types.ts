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

  latencyTotal: string | null;
  latencyDNS: string | null; // Time to lookup domain name
  latencyTCP: string | null; // Time to establish TCP connection
  latencyTLS: string | null; // Time to establish TLS connection (after TCP)
  latencyFirstByte: string | null; // Time to receive first byte of response (after TLS)
  latencyDownload: string | null; // Time to receive full response (after first byte)

}

export interface Args {
  hosts?: string[];
  numberOfRuns?: number;
  useHttp3?: boolean;
  globalPingApiKeys?: string[];
  locations?: string[];
}
