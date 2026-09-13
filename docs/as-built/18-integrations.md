# 18 — Integrations

## NTES (Indian Railways)

| Item | Value |
|------|-------|
| Endpoint | `https://enquiry.indianrail.gov.in/crisns/AppServAnd` |
| Client | `services/ntesClient.js` |
| Crypto | `services/ntesCrypto.js` (AES jsonIn protocol) |
| Primary service | `TrainsAtStationJson` |
| Also used | Station resolve / running helpers as coded |

### Data used

- Halting trains at station (not pass-through)
- Expected arrival/departure, platform, delay/status flags
- Coach position strings + PWD coach indices for Coach product

### Failure modes

- Upstream downtime → 502/empty boards
- Empty composition for some MEMUs → Coach prefers next rake with coaches

## AWS services

S3, CloudFront, Lambda, API Gateway HTTP API, EventBridge, ACM, IAM, CloudWatch.

## Cloudflare DNS

CNAME records for `platform.zasya.online` and `coach-position.zasya.online` → respective CloudFront domains (**DNS only / grey cloud** for ACM).

## GitHub

Actions for deploy dispatch and Coach cache backup.

## Not integrated

Payment gateways, SMS/email providers, Slack bots (ops process only), SSO IdPs, analytics SDKs — **Could not infer / absent**.
