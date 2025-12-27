# TU Dresden Internet Measurements: Cloudflare Load Balancer Analysis

This project investigates the behavior, distribution, and performance of Cloudflare's edge network load balancers. By leveraging the unified `/cdn-cgi/trace` debug endpoint across various domains and vantage points, we aim to map load balancer assignments and connection characteristics.

## Research Objectives

We aim to collect a comprehensive dataset to answer the following questions:

- **Balancer Variance**: Do different domains (e.g., `chatgpt.com`, `cloudflare.com`, `claude.ai`) resolving to the same PoP use different load balancer pools?
- **Geographic Mapping**: How do specific Anycast IPs and colocation centers (Colos) map to specific load balancers (`fl` ID)?
- **Protocol Adoption**: Are there differences in how requests are handled across HTTP/1.1, HTTP/2, and HTTP/3?

## Methodology

### The Reference Endpoint

Cloudflare exposes a debug endpoint at `/cdn-cgi/trace` which returns connection metadata in a key-value format.

**Example Response:**

```text
fl=1034f22              # Balancer ID
h=cloudflare.com        # Host
ip=62.245.232.8         # Client IP
ts=1766521129.521       # Timestamp
visit_scheme=https      # Scheme
uag=Mozilla/5.0...      # User Agent
colo=MUC                # Colocation Center (e.g., Munich)
http=http/3             # HTTP Version
loc=DE                  # Client Country
tls=TLSv1.3             # TLS Version
sni=plaintext           # SNI Status
warp=off                # WARP Status
gateway=off             # Gateway Status
kex=X25519MLKEM768      # Key Exchange
```

### Measurement Strategy

We employ a hybrid measurement strategy to maximize coverage:

1.  **Distributed Measurement (GlobalPing)**

    - **Tool**: [GlobalPing API](https://globalping.io/docs/api.globalping.io#overview)
    - **Scope**: Worldwide vantage points (filtering by country code).
    - **Protocols**: HTTP/1.1, HTTP/2 (GlobalPing limitation).
    - **Resources**: ~500 measurements/hour (free tier); scalable with API key rotation.

2.  **Local Measurement**
    - **Tool**: Local JavaScript agent.
    - **Scope**: High-frequency checks from the local network.
    - **Protocols**: HTTP/3 (QUIC), HTTP/2, HTTP/1.1.
    - **Advantages**: No rate limits, comprehensive protocol support.

## Implementation

The measurement tool is written in **JavaScript**

### CLI Arguments

The program implements the following logic loops and accepts arguments:

- **Targets**: `--hosts` comma seperated list of hosts to test on.
- **Protocols**: `--http3` enforces http3 usage when passed in. **only applicable to `local` tests**
- **Volume**: `--runs` number of runs/requests per host.
- **Vantage Points**: `--locations` comma seperated list of ISO country codes. **only applicable to `globalPing` tests**
- **Keys**: `--keys` comma seperated list of GlobalPing API keys.

### Running

First ensure you run `npm install` in the `collector` directory to install the necessary dependencies.

There are 2 modes for running, `local` and `globalPing`

#### `local`

This runs the test locally on the given hosts for the given number of runs. This is a good way to discover load balancers available at your current location.

While in the `collector` directory, run as follows

```bash
npm run run:local -- --hosts=https://cloudflare.com,https://chatgpt.com --runs 3 --http3
```

You may also build using

```bash
npm run build:local
```

And use the built `dist/local.js` to run from anywhere, not limiting being inside this directory.

```bash
node local.js --hosts=https://cloudflare.com,https://chatgpt.com --runs 3 --http3
```

#### `globalPing`

This runs the test using GlobalPing in the provided regions. This is a good way to discover load balancer on a global scale.

While in the `collector` directory, run as follows

```bash
npm run run:globalPing -- --hosts=https://cloudflare.com,https://chatgpt.com --locations=DE --keys=<YOUR_API_KEY>
```

Like the local script, you may also build into a binary to be run from anywhere.

```bash
npm run build:globalPing
```

##### Modes
Standard `globalPing` selects one probe on the region and runs all request on that single probe to get as many LB instances visible from that probe.

Sequential mode `npm run run:globalPingSeq` will run through all probes of the regions sequentially, each run/request from another probe. Use sequantial to uncover more load balancer across the region, use standard for more targeted discovery of a single LB.

### Data Output

All responses are parsed, flattened, and appended to a **CSV file** for easy analysis. Timestamped files saved in `results/*` directory from where the script is called from

**CSV Header Columns (ordered):**
| Field | Description |
|------------------|----------------------------|
| balancerId | Load balancer ID |
| host | Hostname |
| clientIp | Client IP Address |
| timestamp | Request timestamp |
| scheme | Connection scheme |
| userAgent | User Agent string |
| colocationCenter | Data center/colocation ID |
| httpVersion | HTTP Version used |
| clientCountry | Country of client |
| tlsVersion | TLS Version |
