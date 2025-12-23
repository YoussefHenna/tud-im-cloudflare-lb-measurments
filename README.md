# TU Dresden Internet Measurements: Cloudflare Load Balancer Analysis

This project investigates the behavior, distribution, and performance of Cloudflare's edge network load balancers. By leveraging the unified `/cdn-cgi/trace` debug endpoint across various domains and vantage points, we aim to map load balancer assignments and connection characteristics.

## Research Objectives

We aim to collect a comprehensive dataset to answer the following questions:
*   **Balancer Variance**: Do different domains (e.g., `chatgpt.com`, `cloudflare.com`, `claude.ai`) resolving to the same PoP use different load balancer pools?
*   **Geographic Mapping**: How do specific Anycast IPs and colocation centers (Colos) map to specific load balancers (`fl` ID)?
*   **Protocol Adoption**: Are there differences in how requests are handled across HTTP/1.1, HTTP/2, and HTTP/3?
*   **Latency Analysis**: How does the choice of protocol or vantage point impact connection latency?

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
    *   **Tool**: [GlobalPing API](https://globalping.io/docs/api.globalping.io#overview)
    *   **Scope**: Worldwide vantage points (filtering by country code).
    *   **Protocols**: HTTP/1.1, HTTP/2 (GlobalPing limitation).
    *   **Resources**: ~500 measurements/hour (free tier); scalable with API key rotation.

2.  **Local Measurement**
    *   **Tool**: Local JavaScript agent.
    *   **Scope**: High-frequency checks from the local network.
    *   **Protocols**: HTTP/3 (QUIC), HTTP/2, HTTP/1.1.
    *   **Advantages**: No rate limits, comprehensive protocol support.

## Implementation

The measurement tool is written in **JavaScript** and supports two primary modes of operation.

### CLI Arguments
The program implements the following logic loops and accepts arguments:
*   **Mode**: `--daemon` (hourly cron) or `--oneshot`.
*   **Targets**: `--domains` (e.g., `cloudflare.com,chatgpt.com`).
*   **Protocols**: `--http-versions` (h1, h2, h3).
*   **Security**: `--tls` (on/off).
*   **Vantage Points**: `--locations` (ISO country codes for GlobalPing).
*   **Volume**: `--limit` (tests per measurement batch).
*   **Keys**: `--keys` (GlobalPing API keys).

### Data Output

All responses are parsed, flattened, and appended to a **CSV file** for easy analysis.

**Target Schema:** TODO
`timestamp, vantage_point, country, target_domain, protocol, tls_version, balancer_id_fl, colo_id, client_ip, kex, latency_ms`
