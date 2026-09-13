# BUILD DOCUMENT — Railway Local MVP
**Version:** BUILD v1.1  
**Mode:** BUILD  
**Status:** Final implementation contract for Cursor  
**Basis:** Frozen SPECIFY decisions + implementation review recommendations

---

# 0. Instructions to Cursor

You are implementing the **Railway Local MVP**.

Treat this document as the authoritative implementation specification.

## Rules

1. Do not expand scope.
2. Do not implement future features unless explicitly marked as required for MVP.
3. Do not replace working existing functionality unnecessarily.
4. Reuse the existing PDS and Coach Position implementation wherever practical.
5. Preserve the separation between Platform and Coach applications.
6. Do not introduce microservices, Docker, Kubernetes, databases, cloud dependencies, or unnecessary frameworks.
7. Prefer simple local processes managed by `systemd`.
8. Do not make the TV/browser responsible for NTES communication.
9. Do not make normal station operation dependent on Internet/cloud connectivity.
10. Do not hard-code station-specific values into source code.
11. Do not leave development credentials/default passwords in production configuration.
12. If an implementation decision is genuinely ambiguous, **stop and report the ambiguity rather than silently changing the specification**.
13. Do not implement two-PC HA, central fleet management, central licensing, automatic updates, or advanced DRM in this build.
14. Preserve existing working behaviour unless the change is explicitly required by this BUILD document.
15. Every BUILD step must leave the repository in a runnable/testable state.

## Conflict reporting

If the source implementation conflicts with this document, report:

```text
CONFLICT
Current implementation:
...

BUILD specification:
...

Impact:
...

Recommended resolution:
...
```

Do not silently resolve architectural conflicts.

---

# 1. Existing System Context

The existing system contains two relevant application areas:

```text
PDS / Platform
Coach Position
```

The as-built material shows local Express/server implementations and filesystem-backed local data, while production also contains cloud/serverless components.

The Railway MVP is a **new deployment target**:

> One local Ubuntu PC running the Platform application, Coach Position application, Admin Panel and NTES integration.

Do not reproduce the cloud deployment for this MVP.

Reuse existing domain/application logic wherever practical.

---

# 2. Target Architecture

```text
                         Railway MPLS
                              │
                              ▼
                            NTES
                              │
                              ▼
                     ┌─────────────────┐
                     │  NTES Service   │
                     │                 │
                     │ polling/retry   │
                     │ freshness       │
                     └────────┬────────┘
                              │
                       local IPC / state
                         ┌────┴────┐
                         ▼         ▼
                  ┌──────────┐ ┌──────────┐
                  │ Platform │ │  Coach   │
                  │ Service  │ │ Service  │
                  └────┬─────┘ └────┬─────┘
                       │             │
                       └──────┬──────┘
                              │
                         Local Gateway
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
          /platform         /coach          /admin
              │               │               │
              ▼               ▼               ▼
             TVs          TVs/users       Station Master
```

The application processes are separate OS processes.

Operational management is unified through `systemd`.

---

# 3. Process Isolation

Platform, Coach and NTES must remain separate OS processes.

Use:

```text
zasya-railway-ntes.service
zasya-railway-platform.service
zasya-railway-coach.service
zasya-railway-admin.service
```

If Admin can safely be part of the local gateway process, that is acceptable provided Admin remains logically isolated.

Use:

```text
zasya-railway.target
```

so that the complete station stack can be operated as one logical unit:

```bash
systemctl start zasya-railway.target
systemctl stop zasya-railway.target
systemctl status zasya-railway.target
```

### Isolation requirements

A crash in Coach must not terminate Platform.

A crash in Platform must not terminate Coach.

A crash in NTES must not terminate either UI.

systemd must restart failed services automatically.

---

# 4. Inter-Process Communication — DECIDED

Because NTES, Platform and Coach are separate OS processes, **do not use an in-process event emitter as the primary integration mechanism**.

For MVP, use **durable local state files plus atomic replacement** as the cross-process data exchange mechanism.

Architecture:

```text
NTES
 ↓
NTES Service
 ↓
normalised station state
 ↓
atomic write
 ↓
/var/lib/zasya/railway/runtime/
 ├── ntes_state.json
 ├── ntes_status.json
 └── freshness.json
        │
        ├──────────────┐
        ▼              ▼
   Platform        Coach
```

Platform and Coach may maintain lightweight local watchers/polling against the state files, but:

- they must not contact NTES directly;
- they must not create independent NTES polling loops;
- the files are the durable handoff mechanism;
- file changes should be detected efficiently where practical using filesystem notifications;
- a short fallback polling interval is acceptable for robustness.

Do **not** introduce Redis, RabbitMQ, Kafka, MQTT, or another message broker.

An in-process event emitter may be used **inside a single service** for internal modularity, but it is not the cross-process contract.

---

# 5. Repository Structure

Adapt the existing repository rather than rewriting it.

Target logical structure:

```text
railway/
│
├── platform/
│   ├── public/
│   ├── routes/
│   ├── services/
│   └── ...
│
├── coach-position/
│   ├── public/
│   ├── routes/
│   ├── services/
│   └── ...
│
├── edge/
│   ├── ntes/
│   │   ├── poller.js
│   │   ├── client.js
│   │   └── ...
│   │
│   ├── config/
│   │   ├── config-service.js
│   │   └── schema.js
│   │
│   ├── licence/
│   │   ├── licence-service.js
│   │   ├── verifier.js
│   │   └── schema.js
│   │
│   ├── health/
│   │   └── health-service.js
│   │
│   ├── storage/
│   │   └── atomic-file.js
│   │
│   └── ...
│
├── shared/
│   ├── logging/
│   ├── errors/
│   ├── time/
│   └── ...
│
├── deployment/
│   ├── systemd/
│   ├── nginx/
│   ├── ubuntu/
│   └── scripts/
│
└── tests/
```

Do not force this exact directory tree if the existing repository already has an equivalent clean structure.

The logical separation is mandatory; the physical file structure may be adapted to the existing codebase.

---

# 6. URL Contract

These URLs are part of the MVP interface and must remain stable:

```text
/platform
/coach
/admin
/health
```

API routes:

```text
/api/*
```

Examples:

```text
/api/platform/...
/api/coach/...
/api/admin/...
/api/edge/...
/api/licence/...
```

TVs must never need to know internal service ports.

---

# 7. Nginx / Local Gateway

Use Nginx or an equivalent lightweight local reverse proxy.

External interface:

```text
http://station-pc/platform
http://station-pc/coach
http://station-pc/admin
http://station-pc/health
```

Internal services may use local ports.

Internal application ports should bind to:

```text
127.0.0.1
```

where practical.

Only the gateway should expose the application HTTP interface on the station LAN.

---

# 8. NTES Service

There must be exactly **one NTES polling mechanism per station appliance**.

Do not implement:

```text
Platform → NTES
Coach → NTES
```

Implement:

```text
NTES
 ↓
NTES Poller
 ↓
normalised local state
 ├── Platform consumes
 └── Coach consumes
```

Reuse the existing NTES client/crypto implementation where compatible.

---

# 9. NTES Poller Responsibilities

The NTES service owns:

- NTES credentials/configuration
- connection
- polling
- timeout
- retry
- backoff
- freshness
- last successful update
- normalized station data
- NTES status
- atomic persistence of NTES state
- publication of updated local state

It does not own:

- Platform UI
- Coach UI
- Admin UI
- display rendering

---

# 10. NTES Configuration

Station-specific configuration must be externalized.

Conceptual example:

```json
{
  "stationCode": "BG",
  "ntes": {
    "endpoint": "...",
    "credentials": {
      "username": "...",
      "password": "..."
    }
  }
}
```

The exact credential structure must follow the actual Railway NTES interface once provided.

Do not assume the exact fields above.

The application must support the possibility that Railway provides credentials restricted to one station.

Do not build unrestricted multi-station NTES access into the MVP.

---

# 11. NTES Data Flow

Implement:

```text
NTES
 ↓
NTES adapter
 ↓
normalised station data
 ↓
atomic local state
 ↓
Platform / Coach consumers
```

Example normalized state:

```json
{
  "stationCode": "BG",
  "fetchedAt": "...",
  "trains": [],
  "source": "NTES"
}
```

The exact train schema should reuse the existing domain model wherever practical.

---

# 12. NTES Runtime State Ownership

The NTES service is the **sole writer** for:

```text
/var/lib/zasya/railway/runtime/ntes_state.json
/var/lib/zasya/railway/runtime/ntes_status.json
/var/lib/zasya/railway/runtime/freshness.json
```

Platform and Coach are readers of these files.

They must not write NTES runtime state.

---

# 13. Persistence

Persistence exists for:

- recovery
- caching
- configuration
- overrides
- diagnostics

It is not a distributed message broker.

Use JSON/filesystem persistence for MVP.

Target:

```text
/var/lib/zasya/railway/
├── config/
├── licence/
├── platform/
├── coach/
├── runtime/
└── backup/
```

---

# 14. Atomic File Writes

Every mutable JSON file must use:

```text
write temporary file
       ↓
flush
       ↓
atomic rename
```

Implement a reusable:

```text
atomicWriteJson()
```

utility.

Never directly overwrite an active state file.

---

# 15. One Writer Per File

Explicit ownership:

```text
NTES runtime state
    → NTES service

platform state
    → Platform service

platform overrides
    → Platform service

coach board
    → Coach service

coach configuration
    → Coach service/config service

station configuration
    → Config service

licence
    → Licence service / installer

audit log
    → Audit service

backup/export package
    → Backup/export service or controlled installer/admin operation
```

Admin must communicate through the owning service/API rather than directly editing another service's files.

---

# 16. Platform Application

Reuse the existing PDS implementation.

MVP responsibilities:

- consume normalized NTES station data
- maintain local platform state
- render platform display
- support platform overrides
- expose health status
- expose required APIs

Do not introduce new cloud infrastructure.

Do not rewrite working UI code without a requirement.

---

# 17. Platform Display

Route:

```text
/platform
```

Must be browser-compatible.

Must work in Chromium.

Must work without Android-specific APIs.

Browser communicates only with the local station server.

---

# 18. Platform Override

Preserve the existing platform override concept.

Expected API shape:

```text
GET  /api/admin/platforms
POST /api/admin/platforms
POST /api/admin/platforms/clear
```

Mutation endpoints require Admin authentication.

---

# 19. Coach Application

Reuse the existing Coach Position implementation.

MVP responsibilities:

- consume normalized station data
- generate/maintain coach board
- render coach display
- support required display configuration
- expose health status

Only implement Coach features required by the initial Railway MVP.

Do not expand Premium/Chart/etc. unless they are already explicitly required.

---

# 20. Coach Display

Route:

```text
/coach
```

The browser receives coach information from the local server.

The TV must not call NTES.

---

# 21. Admin Panel

Route:

```text
/admin
```

MVP functions:

### Station

Display:

```text
Station code
Station name
Licence status
```

### Platform

- view overrides
- create/update override
- clear override

### Coach

Expose only the configuration required by the MVP.

### System

Display:

```text
NTES status
Platform status
Coach status
Licence status
Last NTES update
System time
Time-sync status where available
```

---

# 22. Admin Authentication

MVP uses one logical local administrator identity:

```text
local-admin
```

Provision a unique strong credential during installation.

Requirements:

- no hard-coded production credential
- no known default password
- credential never exposed in frontend source
- mutation endpoints protected
- authenticated mutations audited

### Brute-force/rate limiting decision

**No sophisticated rate limiting is required for MVP.**

Reason:

- Admin is intended for the trusted station LAN.
- HTTPS is explicitly out of scope for MVP.
- Firewall/network controls are the primary boundary.

However, authentication failures should be logged.

If repeated failed attempts can be trivially detected with minimal effort, logging should include the event without introducing an authentication subsystem.

---

# 23. Audit Log

Every administrative mutation must create an audit event.

Example:

```json
{
  "timestamp": "2026-08-25T10:30:00Z",
  "actor": "local-admin",
  "action": "platform_override",
  "details": {
    "trainNo": "12345",
    "platform": "3"
  }
}
```

The audit log must explicitly be understood as station-level accountability only.

MVP does not identify individual operators.

---

# 24. Licence Service

Implement:

```text
LicenceService
```

Responsibilities:

- load licence
- verify signature
- verify station
- verify product entitlement
- verify validity
- expose licence status
- provide authorization decisions

Do not implement central licence management.

---

# 25. Licence Format

Minimum conceptual structure:

```json
{
  "licenceId": "ZSY-BG-001",
  "stationCode": "BG",
  "products": [
    "platform",
    "coach"
  ],
  "validFrom": "2026-08-25",
  "validUntil": "2027-08-24",
  "signature": "..."
}
```

Reserve extension fields where useful:

```text
installationId
maxInstallations
features
```

Do not enforce future fields unless required by MVP.

---

# 26. Licence Cryptography

Use asymmetric signing.

Conceptually:

```text
Private signing key
       ↓
licence generation

Public verification key
       ↓
Railway appliance
       ↓
licence verification
```

Private signing key must never be present on the Railway appliance.

Do not implement homemade cryptography.

Use a standard maintained cryptographic library available in the project/runtime.

---

# 27. Licence Validation

Startup sequence:

```text
load licence
 ↓
parse
 ↓
verify signature
 ↓
verify station
 ↓
verify product
 ↓
verify dates
```

Possible states:

```text
VALID
EXPIRING
DEGRADED
BLOCKED
MISSING
INVALID
```

---

# 28. Licence Grace Period

Distinguish:

### Never-valid licence

```text
missing
invalid signature
wrong station
wrong product
never successfully validated
```

→ BLOCKED

### Previously valid licence

```text
VALID
 ↓
temporary validation problem
```

→ DEGRADED

then:

```text
grace expires
 ↓
BLOCKED
```

The grace duration must be configurable.

Do not invent a commercial grace duration in code.

---

# 29. Licence Revalidation Failure

A previously-valid licence should not immediately blank passenger displays because of a transient validation failure.

Example causes:

- temporary file read failure
- temporary validation service error
- recoverable system condition

Transition:

```text
VALID
 ↓
validation failure
 ↓
DEGRADED
 ↓
grace countdown
 ↓
VALID again
```

or:

```text
DEGRADED
 ↓
grace expires
 ↓
BLOCKED
```

The implementation must record the transition time so the grace period is deterministic.

---

# 30. Time Synchronization

The appliance must have system time synchronization configured.

The application should expose where available:

```text
systemTime
lastTimeSync
timeSyncStatus
```

Do not assume public Internet NTP.

Use the time source available in the Railway environment.

### Time drift policy

No automatic licence-blocking threshold based on clock drift is defined for MVP.

If time synchronization is unavailable:

```text
health = DEGRADED
```

where this can be determined reliably.

Do not invent a specific drift threshold.

If the system time is obviously invalid, report it as a diagnostic condition.

Do not silently modify system time from application code.

---

# 31. Health Service

Implement:

```text
GET /health
GET /api/edge/status
```

Example:

```json
{
  "status": "healthy",
  "stationCode": "BG",
  "licence": "valid",
  "ntes": "connected",
  "platform": "running",
  "coach": "running",
  "lastNtesUpdate": "2026-08-25T10:32:14Z",
  "timeSync": "healthy"
}
```

Health states:

```text
healthy
degraded
failed
```

---

# 32. NTES Health

Track:

```text
connected
disconnected
stale
error
```

At minimum:

```text
lastAttempt
lastSuccess
lastDataUpdate
error
```

---

# 33. Stale Data

If NTES temporarily fails:

**do not immediately blank passenger displays.**

Retain last valid data according to safe application behaviour.

Expose freshness internally.

Example:

```text
dataUpdatedAt
sourceStatus = stale
```

Do not invent a new passenger-facing stale threshold unless already defined elsewhere.

---

# 34. Recovery

When NTES returns:

```text
NTES reconnect
 ↓
poll
 ↓
normalize
 ↓
atomic state update
 ↓
Platform/Coach detect new state
 ↓
update
```

No application restart should be required.

---

# 35. Platform/Coach Failure Isolation

Test explicitly.

### Kill Platform

Expected:

```text
Platform unavailable/restarting
Coach remains operational
NTES remains operational
```

### Kill Coach

Expected:

```text
Coach unavailable/restarting
Platform remains operational
NTES remains operational
```

### Kill NTES

Expected:

```text
Platform remains running
Coach remains running
stale/error state visible
NTES automatically restarts/reconnects
```

---

# 36. systemd

Create:

```text
zasya-railway.target
zasya-railway-ntes.service
zasya-railway-platform.service
zasya-railway-coach.service
zasya-railway-admin.service
```

Services should use:

```text
Restart=on-failure
```

with sensible restart delays.

Do not create aggressive zero-delay restart loops.

The target should express service dependencies where required.

---

# 37. Nginx

Configure:

```text
/platform
/coach
/admin
/health
/api/*
```

Only Nginx exposes the LAN HTTP interface.

Internal Node ports should not be exposed directly.

---

# 38. Chromium Kiosk

The appliance must automatically launch Chromium after boot.

Display URL is deployment configuration.

Example:

```text
http://station-pc/platform
```

Chromium should use kiosk/fullscreen mode where appropriate.

Create a watchdog/restart mechanism.

If Chromium exits:

```text
Chromium exits
 ↓
systemd/watchdog
 ↓
Chromium restarts
```

Do not implement sophisticated DOM health monitoring for MVP.

---

# 39. HDMI

The PC physically drives the TV through HDMI.

Software must not depend on Android TV APIs.

The PC provides the display through Chromium.

---

# 40. Ubuntu Hardening

Use a minimal Ubuntu Server installation.

Install only required components:

- network
- minimal graphical stack
- Chromium
- Node runtime
- Nginx
- SSH
- firewall
- Railway application

Disable unnecessary services.

Do not install a full desktop environment unless technically required.

---

# 41. SSH

SSH must be installed and hardened.

MVP:

- key-based authentication
- disable root login
- disable password SSH where practical
- dedicated support user
- limited sudo
- no unnecessary exposed SSH path

Do not build the future remote-support gateway.

---

# 42. HTTP vs HTTPS

For MVP:

**HTTP on the trusted station LAN is explicitly accepted.**

This is a deliberate scope decision.

Admin credentials must not be exposed outside the trusted station LAN.

Firewall/network binding must enforce this.

HTTPS is future work.

---

# 43. Firewall

Default policy should be restrictive.

Allow only required services.

Conceptually:

```text
LAN → 80/HTTP
LAN → SSH only when required/approved
localhost → internal application ports
```

Do not expose internal Node ports.

Do not expose application/admin services to arbitrary Internet interfaces.

---

# 44. File Permissions

Application code should be owned by the application deployment owner.

Runtime data should be owned by the relevant application user/service account.

At minimum:

- licence must not be writable by passenger-facing processes;
- station configuration must not be writable by passenger-facing processes;
- NTES credentials must be protected;
- admin credentials must be protected;
- application binaries/code must not be writable by the passenger-facing process.

This is important because station binding is meaningful only if a lower-trust passenger-facing process cannot rewrite the station configuration.

---

# 45. Secrets

Do not put:

- NTES credentials
- admin credential
- licence private key

inside frontend code.

Private signing key must never be deployed.

Protected configuration may live under:

```text
/etc/zasya/railway/
```

with restricted permissions.

Example:

```text
/etc/zasya/railway/config.json
/etc/zasya/railway/ntes.json
```

---

# 46. Logging

Use:

```text
/var/log/zasya/railway/
```

Suggested:

```text
edge.log
ntes.log
platform.log
coach.log
admin.log
```

Implement:

- rotation
- maximum size
- bounded retention
- timestamps
- severity

A long-running appliance must not fill its disk because of logs.

---

# 47. Backup and Recovery

Implement a simple local configuration export.

Backup must include enough non-secret configuration to reconstruct the station:

```text
station identity
application configuration
display configuration
licence
configuration version
```

### Secrets decision

**Do not include NTES credentials or admin credentials in the normal export package.**

Reason:

- these are sensitive credentials;
- the MVP does not yet define an encrypted secret-backup/key-management mechanism.

Therefore restore flow is:

```text
restore configuration
+
re-enter protected credentials
```

This is intentional.

Do not create a homemade backup encryption system for MVP.

---

# 48. Installation Tool

Create:

```bash
sudo railway-setup
```

Collect:

```text
Station Code
Station Name
Licence
NTES configuration
Admin credential
```

Secure inputs must not be echoed.

The setup process should be safe to rerun.

---

# 49. Installation Validation

Validate:

```text
OS
CPU/memory
disk
network
required packages
station configuration
licence
NTES connectivity
ports
permissions
services
time status
```

Then display:

```text
INSTALLATION READY
```

or a clear failure list.

---

# 50. Installation Verification UI

Create a local verification screen:

```text
ZASYA RAILWAY APPLIANCE
────────────────────────────

Station       BG              ✓
Licence       VALID           ✓
Platform      RUNNING         ✓
Coach         RUNNING         ✓
NTES          CONNECTED       ✓
Network       OK              ✓
Storage       OK              ✓
Display       HDMI            ✓
Time Sync     OK              ✓

SYSTEM READY
```

This is a first-class deliverable.

---

# 51. Configuration Model

Station identity:

```json
{
  "stationCode": "BG",
  "stationName": "Bhongir"
}
```

Do not embed station identity in application source.

Same application build must support another station by configuration/licence.

---

# 52. No Multi-Station Runtime

For MVP:

```text
one PC
=
one station
```

Do not implement one appliance serving multiple stations.

---

# 53. No Two-PC Implementation

Do not implement:

- heartbeat between PC-A/PC-B
- failover
- configuration replication
- shared state
- virtual IP
- primary/secondary PC
- cluster election

Future architecture must remain possible, but none belongs in MVP.

---

# 54. No Central Management

Do not implement:

- fleet dashboard
- cloud heartbeat
- central configuration
- central licence activation
- central station registry

MVP operates independently.

---

# 55. No Update System

Do not implement:

- auto-update
- update server
- package repository
- update scheduler
- rollback system

Version information may exist for diagnostics.

---

# 56. No Advanced DRM

Do not implement:

- TPM
- kernel modules
- anti-debugging
- binary obfuscation systems
- sophisticated software DRM

MVP protection:

```text
signed licence
+
station binding
+
application packaging
+
protected files
+
hardened OS
```

---

# 57. Existing Cloud Code

Do not delete the existing cloud implementation simply because Railway MVP does not use it.

Separate Railway deployment from cloud deployment.

Avoid destructive refactoring.

---

# 58. Local Runtime Principle

Railway application must operate when:

```text
Internet = unavailable
Central Zasya = unavailable
```

provided:

```text
Railway MPLS + NTES = available
```

This is a hard requirement.

---

# 59. Internet Support Principle

If Internet becomes available later through:

- Wi-Fi dongle
- hotspot
- separate interface

the appliance must continue operating.

Do not assume Internet is the primary network interface.

---

# 60. Public IP

Never use public IP as:

- installation identity
- licence identity
- station identity

It may be shown diagnostically.

---

# 61. Time and Licence Failure Safety

If a licence was previously valid and validation suddenly fails, enter `DEGRADED` and begin the configured grace timer.

If the system clock is clearly abnormal, expose a diagnostic warning and make licence behaviour follow the same previously-valid grace policy rather than immediately blanking a live display.

Do not invent a clock-drift threshold.

A missing/never-valid licence remains immediately blocked.

---

# 62. Testing Requirements

Create tests for:

## Licence

```text
valid licence
invalid signature
wrong station
wrong product
expired
missing
previously-valid → validation failure
DEGRADED state
grace countdown
grace expiry
recovery before grace expiry
```

## NTES

```text
successful connection
timeout
authentication failure
network loss
reconnect
stale data
```

## Platform

```text
display
override
clear override
invalid admin request
```

## Coach

```text
display
data update
configuration
```

## Process isolation

```text
Platform crash
Coach remains running

Coach crash
Platform remains running

NTES crash
UI processes remain running
```

## Persistence

```text
atomic write
simulated interrupted write
restart
state recovery
```

## Appliance

```text
reboot
services restart
Chromium restart
firewall
SSH
time status
```

---

# 63. Acceptance Test — Fresh Install

Start with a clean Ubuntu machine.

Run:

```bash
sudo railway-setup
```

Configure:

```text
BG
licence
NTES
admin
```

Expected:

```text
all required services running
/platform accessible
/coach accessible
/admin accessible
/health healthy or correctly degraded with clear reason
```

---

# 64. Acceptance Test — Reboot

```bash
sudo reboot
```

After boot:

```text
Platform service → running
Coach service → running
NTES service → running
Nginx → running
Chromium → running
```

No manual developer intervention.

---

# 65. Acceptance Test — NTES Loss

Disconnect NTES/MPLS.

Expected:

```text
NTES = disconnected/stale
Platform = running
Coach = running
```

Reconnect.

Expected:

```text
NTES reconnects
fresh data arrives
Platform updates
Coach updates
```

No application restart required.

---

# 66. Acceptance Test — Platform Crash

Kill Platform process.

Expected:

```text
Platform automatically restarts
Coach unaffected
NTES unaffected
```

---

# 67. Acceptance Test — Coach Crash

Kill Coach process.

Expected:

```text
Coach automatically restarts
Platform unaffected
NTES unaffected
```

---

# 68. Acceptance Test — Invalid Licence

Use a never-valid licence, for example one with an invalid signature.

Expected:

```text
licence = INVALID/BLOCKED
application does not operate normally
no grace period
```

This test must not be used to test the grace path.

---

# 69. Acceptance Test — Previously Valid Licence Grace

Start with a valid licence.

Verify:

```text
VALID
```

Then introduce a controlled validation failure that represents a previously-valid licence becoming temporarily invalid.

Expected:

```text
VALID
 ↓
DEGRADED
 ↓
grace timer starts
```

Before grace expiry:

```text
application remains operational
licence status = DEGRADED
```

Restore validation:

```text
DEGRADED
 ↓
VALID
```

Then repeat and allow the configured grace period to expire:

```text
DEGRADED
 ↓
grace expires
 ↓
BLOCKED
```

This test is mandatory.

---

# 70. Acceptance Test — Admin Security

Without credentials:

```text
POST /api/admin/platforms
```

must fail.

With valid credentials:

```text
POST /api/admin/platforms
```

must succeed.

Every successful mutation creates an audit event.

Authentication failures should also be logged.

No rate-limiting subsystem is required for MVP.

---

# 71. Acceptance Test — Station Binding

Install:

```text
licence station = SC
configuration station = BG
```

Expected:

```text
startup/activation rejected
```

Verify that passenger-facing processes cannot rewrite station configuration.

---

# 72. Acceptance Test — No Internet

Disconnect Internet while preserving MPLS.

Expected:

```text
Platform works
Coach works
Admin works
NTES works
```

No cloud API is required.

---

# 73. Acceptance Test — Browser

From another device on the station LAN:

```text
http://station-pc/platform
http://station-pc/coach
http://station-pc/admin
```

Expected:

- Platform loads
- Coach loads
- Admin requires authentication

---

# 74. Acceptance Test — Internal Ports

From another LAN device, internal Node ports must not be directly accessible.

Only intended gateway ports should be exposed.

---

# 75. Acceptance Test — Disk Protection

Generate logs for an extended period.

Verify:

```text
log rotation
bounded retention
disk remains safe
```

---

# 76. Acceptance Test — Configuration Recovery

Export configuration.

Reinstall application.

Restore configuration.

Re-enter protected NTES/admin credentials.

Expected:

```text
station identity restored
licence restored
display configuration restored
credentials re-entered
application operational
```

---

# 77. Build Order

## BUILD-01 — Inspect and Map

Before changing code:

1. Inspect source tree.
2. Identify PDS entry point.
3. Identify Coach entry point.
4. Identify NTES client.
5. Identify current NTES polling paths.
6. Identify config/storage.
7. Identify admin APIs.
8. Identify cloud dependencies.
9. Identify existing tests.
10. Produce a short implementation map.

Do not remove existing polling yet.

---

## BUILD-02 — Edge Foundations

Implement:

```text
config
storage
licence
health
logging
runtime state
```

No application behaviour should regress.

---

## BUILD-03 — NTES Service in Parallel

Implement the new single NTES service/poller.

**Do not remove the old Platform/Coach polling paths yet.**

The new NTES service must:

- connect to NTES;
- normalize data;
- write atomic runtime state;
- expose status;
- support retry/backoff;
- pass unit/integration tests.

At this point the existing applications should continue using their existing paths so the repository remains runnable.

---

## BUILD-04 — Migrate Platform

Connect Platform to the new NTES runtime state.

Verify:

```text
new NTES path works
Platform UI works
Platform tests pass
```

Only after the new Platform path is verified:

> Remove/disable the old Platform-specific NTES polling.

---

## BUILD-05 — Migrate Coach

Connect Coach to the new NTES runtime state.

Verify:

```text
new NTES path works
Coach UI works
Coach tests pass
```

Only after the new Coach path is verified:

> Remove/disable the old Coach-specific NTES polling.

At the end of BUILD-05 there must be exactly one NTES polling mechanism.

---

## BUILD-06 — Admin

Implement:

- authentication
- platform override
- required Coach configuration
- status
- audit

---

## BUILD-07 — Licence

Implement:

- signed licence
- verification
- station binding
- product entitlement
- expiry
- previously-valid grace
- diagnostics

---

## BUILD-08 — Health / Diagnostics

Implement:

- `/health`
- `/api/edge/status`
- service status
- NTES status
- licence status
- freshness
- time status

---

## BUILD-09 — Gateway

Implement Nginx:

```text
/platform
/coach
/admin
/health
/api/*
```

---

## BUILD-10 — systemd

Implement:

```text
zasya-railway.target
zasya-railway-ntes.service
zasya-railway-platform.service
zasya-railway-coach.service
zasya-railway-admin.service
```

---

## BUILD-11 — Ubuntu Appliance

Implement:

- minimal Ubuntu configuration
- firewall
- SSH hardening
- filesystem permissions
- required runtime packages
- logging
- time synchronization configuration

---

## BUILD-12 — Chromium

Implement:

- graphical environment
- kiosk launch
- URL configuration
- watchdog/restart

---

## BUILD-13 — Installer

Implement:

```bash
sudo railway-setup
```

with:

- station
- licence
- NTES config
- admin credential
- validation
- service installation
- verification screen

---

## BUILD-14 — Backup/Recovery

Implement:

- configuration export
- configuration restore
- exclusion of protected credentials from normal backup

---

## BUILD-15 — Complete Verification

Run all acceptance tests in this document.

Do not declare BUILD complete until the critical tests pass.

---

# 78. Cursor Working Discipline

For every BUILD step:

1. Inspect existing code.
2. Identify affected files.
3. Make the smallest appropriate change.
4. Run relevant tests.
5. Verify existing functionality has not regressed.
6. Report what changed.
7. Continue only when the step is stable.

Do not perform a giant rewrite.

---

# 79. Future Extension Points

Only two future boundaries should receive deliberate implementation attention now:

## Installation Identity

Create a clean concept for:

```text
installationId
```

but do not build machine fingerprinting or central registration.

The purpose is to avoid later conflating:

```text
station
licence
installation
machine
```

## Central Licence Authority

The local `LicenceService` must be designed so that a future central authority could supply/validate licences.

Do not implement the central service.

The other future areas remain architectural documentation only:

```text
Two-PC failover
Fleet management
Remote support
Updates
Advanced DRM
```

Do not create empty service/interface files for these unless the existing code structure genuinely requires a boundary.

---

# 80. Definition of Done

BUILD is complete only when:

```text
Fresh Ubuntu PC
       ↓
railway-setup
       ↓
Station configured
       ↓
Licence validated
       ↓
NTES connected
       ↓
Platform running
       ↓
Coach running
       ↓
Admin running
       ↓
Chromium running
       ↓
TV displays working
       ↓
Reboot tested
       ↓
Failure/recovery tested
       ↓
Licence lifecycle tested
       ↓
Configuration recovery tested
```

and the system operates without Internet/cloud connectivity during normal Railway operation.

---

# 81. Final BUILD Constraint

Do not optimize the MVP for a hypothetical 100-station deployment at the expense of getting the first local Railway appliance working.

The first objective is:

```text
ONE PC
ONE STATION
ONE NTES CONNECTION
PLATFORM
COACH
ADMIN
LICENCE
RELIABLE LOCAL OPERATION
```

Future architecture may evolve to:

```text
PC-A + PC-B
       ↓
Fleet Management
       ↓
Central Licensing
       ↓
Remote Support
```

without rewriting the fundamental application boundaries.

---

# 82. Cursor First Action

Before writing implementation code:

1. Inspect the actual repository/source tree.
2. Map existing PDS, Coach, NTES, configuration, persistence, admin and cloud dependencies.
3. Compare that map against this BUILD document.
4. Identify conflicts.
5. Report conflicts using the required format.
6. Only then begin BUILD-02.

**Do not make architectural assumptions that contradict the existing source or this document.**

This document is the **BUILD contract**.
