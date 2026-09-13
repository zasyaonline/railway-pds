# BUILD INSTRUCTIONS — Ubuntu VM Appliance Validation

**Version:** BUILD v1.0  
**Mode:** BUILD / VERIFY  
**Purpose:** Install and validate the Railway Local MVP on a clean Ubuntu Server VM running on the developer's MacBook Pro before testing on physical Railway hardware.

---

# 1. Purpose

The Railway Local MVP is already implemented as a local Ubuntu appliance path.

The next objective is to validate that the application can be installed and operated as an appliance on a clean Ubuntu Server environment.

The VM test must prove the software/appliance layer before physical hardware testing.

## VM test target

```text
MacBook Pro
│
└── UTM
     │
     └── Ubuntu Server VM
          │
          ├── Railway Application
          ├── NTES Service
          ├── Platform
          ├── Coach
          ├── Admin
          ├── Nginx
          ├── systemd
          └── SSH
```

The VM is a test appliance, not the final Railway production environment.

---

# 2. Scope

## IN SCOPE

The VM validation must test:

- Ubuntu Server installation
- application installation
- application dependencies
- Railway setup script
- licence installation
- NTES service
- Platform
- Coach
- Admin
- Nginx
- systemd
- SSH
- firewall
- filesystem permissions
- process isolation
- NTES failure/recovery
- licence lifecycle
- reboot/recovery
- Chromium startup logic
- local LAN-style access from the Mac
- configuration recovery where supported
- log rotation and disk protection

## OUT OF SCOPE

Do not attempt to fully prove:

- Railway MPLS connectivity
- physical HDMI behaviour
- actual TV compatibility
- physical PC hardware
- physical network interface behaviour
- Railway production credentials
- Railway production deployment

Those require the eventual physical appliance.

---

# 3. Important Test Principle

Do not start by trying to reproduce the entire Railway production network.

The first question is:

> Can a clean Ubuntu Server machine be converted into a working Railway appliance using the provided installation process?

Desired flow:

```text
Clean Ubuntu
     ↓
railway-setup
     ↓
Licence
     ↓
NTES
     ↓
Platform
     ↓
Coach
     ↓
Admin
     ↓
Nginx
     ↓
systemd
     ↓
Chromium
     ↓
Working appliance
```

---

# 4. Mac Architecture

On the Mac:

```bash
uname -m
```

Expected:

```text
arm64
```

for Apple Silicon, or:

```text
x86_64
```

for Intel.

## Apple Silicon

Use Ubuntu Server ARM64 and UTM virtualization.

## Intel

Use Ubuntu Server AMD64 and UTM virtualization.

Do not emulate x86 on Apple Silicon unless specifically required.

---

# 5. Ubuntu Version

For the first appliance VM test:

```text
Ubuntu Server 24.04 LTS
```

Use the architecture matching the Mac.

Do not use Ubuntu Desktop.

---

# 6. VM Software

Use UTM.

Mac automation for this runbook lives in `deployment/vm/run-all.sh`.

Create a new VM.

Where Ubuntu architecture matches the Mac architecture, choose:

```text
Virtualize
```

rather than:

```text
Emulate
```

---

# 7. VM Hardware

Recommended:

| Resource | Setting |
|---|---:|
| CPU | 4 cores |
| RAM | 6 GB |
| Disk | 40 GB |
| Network | Shared/NAT |
| Display | Default/minimal initially |
| Architecture | Native |
| Clipboard | Enabled |
| Shared folder | Optional |

---

# 8. VM Network

Initially use:

```text
Network → Shared/NAT
```

This provides temporary Internet access for installing Ubuntu/application dependencies.

Later, test operation without Internet.

---

# 9. Ubuntu Installation

Install Ubuntu Server.

Suggested hostname:

```text
railway-vm
```

Suggested user:

```text
zasya
```

Use a strong password.

Use normal guided storage.

Install:

```text
OpenSSH Server
```

If necessary:

```bash
sudo apt update
sudo apt install -y openssh-server
```

Verify:

```bash
systemctl status ssh
```

---

# 10. First Ubuntu Boot

Run:

```bash
sudo apt update
sudo apt upgrade -y
```

Verify:

```bash
uname -m
lsb_release -a
free -h
df -h
```

On ARM64 Ubuntu, `uname -m` should normally show:

```text
aarch64
```

---

# 11. Network Verification

Run:

```bash
hostname -I
ip addr
```

Record the VM IP address.

---

# 12. SSH Verification

From the Mac:

```bash
ssh zasya@<VM-IP>
```

Example:

```bash
ssh zasya@192.168.64.5
```

SSH must work before continuing.

---

# 13. Repository Transfer

Move the Railway repository into the VM.

If Git is available, clone it.

Otherwise:

```bash
scp -r /path/to/repository     zasya@<VM-IP>:/home/zasya/
```

Then:

```bash
ssh zasya@<VM-IP>
cd ~/railway
```

Use the actual repository path.

---

# 14. Verify Node

Inside the repository:

```bash
node --version
npm --version
cat package.json
```

Use the Node version required by the existing project.

Do not introduce a new version unnecessarily.

---

# 15. Install Dependencies and Baseline Test

Run:

```bash
npm install
npm test
```

Current known baseline is 24 passing tests.

This number is a snapshot of the last known-good baseline, not a permanent fixed target. As tests are added legitimately, the expected count may increase. The gate is that the current suite must pass and must not regress relative to the latest known-good repository state.

## Gate

Do not proceed if the current test suite fails.

Classify any failure as:

- architecture-related
- environment-related
- dependency-related
- actual regression

Do not silently ignore failures.

---

# 16. Do Not Use the Laptop Development Path

Do not validate the appliance simply with:

```bash
npm start
```

The VM must validate:

```text
packages.sh
     ↓
railway-setup
     ↓
systemd
     ↓
Nginx
     ↓
Railway services
```

---

# 17. Licence Preparation

Keep the Ed25519 private signing key outside the appliance.

Conceptual flow:

```text
Development/licensing environment
          │
          │ private signing key
          ▼
     Issue licence
          │
          │ signed licence only
          ▼
    Ubuntu appliance
```

Use the existing licence issuer, for example:

```bash
node deployment/scripts/licence-issue.js   --gen-keys   --out-dir ./keys
```

Never copy the private signing key into Ubuntu.

---

# 18. Install Appliance Dependencies

Inside Ubuntu:

```bash
sudo bash deployment/ubuntu/packages.sh
```

Inspect installed key packages as appropriate:

```bash
dpkg -l | grep -E 'nginx|node|chromium|openssh'
```

Do not assume the Chromium package name is identical across Ubuntu releases/architectures.

---

# 19. Run Railway Setup

Run:

```bash
sudo bash deployment/scripts/railway-setup
```

Provide the actual installer prompts for:

```text
Station Code
Station Name
Licence
NTES configuration
Admin credential
```

Do not manually recreate installer-managed configuration.

---

# 20. Inspect Services

Run:

```bash
systemctl list-units --type=service | grep zasya
```

Then:

```bash
systemctl status zasya-railway.target
```

Inspect the actual service names installed by the script, expected to include:

```bash
systemctl status zasya-railway-ntes.service
systemctl status zasya-railway-platform.service
systemctl status zasya-railway-coach.service
```

---

# 21. Verify Listening Ports

Run:

```bash
sudo ss -lntp
```

Internal Node services should bind to:

```text
127.0.0.1
```

where required by the appliance design.

Nginx should be the externally exposed HTTP gateway.

Internal Node ports must not be unnecessarily exposed to the LAN.

---

# 22. Local URL Verification

From Ubuntu:

```bash
curl http://127.0.0.1/platform/
curl http://127.0.0.1/coach/
curl http://127.0.0.1/admin/
curl http://127.0.0.1/health
curl http://127.0.0.1/api/edge/status
```

Use actual implemented routes if any differ.

---

# 23. Mac-to-VM Verification

From the Mac:

```text
http://<VM-IP>/platform/
http://<VM-IP>/coach/
http://<VM-IP>/admin/
http://<VM-IP>/health
```

Example:

```text
http://192.168.64.5/platform/
```

This simulates:

```text
TV/client
    ↓
station LAN
    ↓
Railway PC
    ↓
local gateway
```

---

# 24. Run Existing Acceptance Scripts

Inside Ubuntu:

```bash
bash deployment/scripts/acceptance.sh urls
bash deployment/scripts/acceptance.sh services
bash deployment/scripts/acceptance.sh ports
bash deployment/scripts/acceptance.sh admin-unauth
```

All applicable checks should pass.

---

# 25. NTES Verification

Check:

```bash
systemctl status zasya-railway-ntes.service
```

Monitor:

```bash
journalctl -u zasya-railway-ntes.service -f
```

Verify runtime state, expected conceptually at:

```text
/var/lib/zasya/railway/runtime/
├── ntes_state.json
├── ntes_status.json
└── freshness.json
```

Inspect the actual configured paths.

---

# 26. Verify One NTES Poller

Mandatory architecture test:

```text
1 NTES poller
     │
     ├── Platform consumes state
     └── Coach consumes state
```

Not:

```text
Platform → NTES
Coach → NTES
NTES service → NTES
```

Inspect:

```bash
ps aux | grep -i node
journalctl -u zasya-railway-ntes.service
```

Confirm Platform and Coach consume local state rather than independently polling NTES.

The process listing is supporting evidence only. Treat the source/configuration architecture and the NTES service logs as the primary proof that exactly one poller is configured and active.

---

# 27. NTES Failure / Recovery Test

This test must prove the appliance behaviour when NTES becomes unreachable without requiring an actual Railway MPLS connection.

## Preparation

1. Start with:
   - valid licence;
   - NTES connected;
   - Platform displaying valid data;
   - Coach displaying valid data.
2. Record the current NTES state and timestamp:

```bash
cat /var/lib/zasya/railway/runtime/ntes_status.json
cat /var/lib/zasya/railway/runtime/freshness.json
```

Use the actual configured runtime path if different.

## Simulate NTES loss

Use a reversible local firewall rule to block the configured NTES destination.

Before changing anything, identify the configured NTES host/endpoint from the appliance configuration.

For example, for a specific TCP destination:

```bash
sudo ufw deny out to <NTES-IP> port <NTES-PORT> proto tcp
```

If UFW cannot express the required destination because the endpoint is hostname-based or otherwise unsuitable, use an equivalent temporary local firewall rule appropriate to the configured endpoint.

Do **not** make a permanent firewall change.

## Verify failure behaviour

Monitor:

```bash
journalctl -u zasya-railway-ntes.service -f
```

Then verify:

```text
NTES → disconnected/error
Platform → remains running
Coach → remains running
last valid passenger data → retained
freshness → becomes stale/degraded according to implementation
```

The passenger displays must not immediately become blank merely because NTES is temporarily unavailable.

Verify the persisted status:

```bash
cat /var/lib/zasya/railway/runtime/ntes_status.json
cat /var/lib/zasya/railway/runtime/freshness.json
```

## Restore NTES connectivity

Remove exactly the temporary blocking rule.

For UFW, for example:

```bash
sudo ufw delete deny out to <NTES-IP> port <NTES-PORT> proto tcp
```

Then monitor:

```bash
journalctl -u zasya-railway-ntes.service -f
```

Expected:

```text
NTES reconnects
 ↓
fresh data arrives
 ↓
runtime state updates
 ↓
Platform updates
Coach updates
```

No manual restart of Platform or Coach should be required.

If the NTES service itself does not recover automatically, that is a failure of the acceptance test and must be investigated rather than worked around manually.

# 28. Process Isolation Test

Stop Platform:

```bash
sudo systemctl stop zasya-railway-platform.service
```

Verify:

```text
Coach remains operational
NTES remains operational
```

Restart:

```bash
sudo systemctl start zasya-railway-platform.service
```

Repeat for Coach.

Expected:

```text
Coach failure → Platform unaffected
Platform failure → Coach unaffected
```

---

# 29. Automatic Service Recovery

Kill a service:

```bash
sudo systemctl kill zasya-railway-platform.service
```

Verify systemd restarts it.

Repeat for:

```text
Platform
Coach
NTES
```

Manual restart does not substitute for automatic recovery.

---

# 30. Reboot Test

Run:

```bash
sudo reboot
```

Reconnect:

```bash
ssh zasya@<VM-IP>
```

Check:

```bash
systemctl status zasya-railway.target
curl http://127.0.0.1/health
```

Expected:

```text
Ubuntu boot
 ↓
systemd
 ↓
NTES
 ↓
Platform
 ↓
Coach
 ↓
Admin
 ↓
Nginx
```

No manual developer application startup should be required.

---

# 31. Invalid Licence Test

This test must exercise the **never-valid → BLOCKED** path.

## Preparation

Start with a known valid licence and record its location.

## Create a never-valid licence

Do not edit the valid licence in place.

Use a licence issued for the wrong station or signed with a different/untrusted signing key.

Preferred repeatable mechanism:

1. Generate a separate test signing key.
2. Issue a test licence with that key.
3. Keep the appliance's trusted public verification key unchanged.
4. Replace the appliance licence with the test licence.

This produces a signature verification failure.

Expected:

```text
INVALID/BLOCKED
```

There must be:

```text
no DEGRADED grace period
```

because this licence has never successfully validated on the appliance.

Restore the known-valid licence after the test.


---

# 32. Licence Grace Test

This test must exercise the **previously-valid → DEGRADED → grace → VALID/BLOCKED** path and must not accidentally exercise the invalid-signature path.

## Preparation

Start with a known-valid licence:

```text
VALID
```

Confirm the appliance has successfully validated it before inducing the failure.

## Create a transient validation failure

Do **not** change the licence signature or replace it with a licence signed by another key.

Instead, temporarily make the trusted public verification key unavailable to the licence verifier while leaving the previously-valid licence unchanged.

For example, after identifying the actual public-key path used by the application:

```bash
sudo mv <public-key-path> <public-key-path>.test-disabled
```

This must be a reversible test-only change.

If the implementation does not read the public key from a filesystem path, use the equivalent reversible mechanism supported by the implementation to make the verifier temporarily unable to access its trusted verification material.

Do not modify application source code for the test.

## Verify DEGRADED

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
licence = DEGRADED
```

Verify the status and logs.

## Restore validation

Restore the trusted public key:

```bash
sudo mv <public-key-path>.test-disabled <public-key-path>
```

Expected:

```text
DEGRADED
 ↓
VALID
```

No manual Platform or Coach restart should be required.

## Verify grace expiry

Repeat the transient-failure setup and leave it in place until the configured grace period expires.

Expected:

```text
DEGRADED
 ↓
grace expires
 ↓
BLOCKED
```

This test is mandatory.


---

# 33. Admin Test

From the Mac:

```text
http://<VM-IP>/admin/
```

Verify:

- authentication
- system status
- licence status
- NTES status
- platform override
- coach configuration
- audit
- verification screen

Unauthenticated mutation:

```bash
curl -i -X POST http://<VM-IP>/api/admin/platforms
```

Expected:

```text
401
```

---

# 34. Configuration Protection Test

Verify passenger-facing processes cannot modify:

```text
station configuration
licence
NTES credentials
admin credentials
```

Inspect:

```bash
ls -la /etc/zasya/railway/
ls -la /var/lib/zasya/railway/
```

Station binding must not be bypassable by rewriting station configuration.

---

# 35. Backup / Restore Test

This test verifies that the station can be reconstructed without silently skipping configuration recovery.

## Preparation

Start with a working appliance:

```text
Station = configured
Licence = VALID
Platform = configured
Coach = configured
```

Identify the project's implemented configuration export/backup command.

Use the actual project command rather than inventing a new backup mechanism.

## Export

Run the supported configuration export.

Verify that the export contains the expected recoverable configuration:

```text
station identity
application configuration
display configuration
licence
configuration version
```

Verify that the normal export does **not** contain protected credentials such as:

```text
NTES password
admin password/secret
licence private signing key
```

The private signing key must never be present on the appliance.

## Reinstallation test

Take a VM snapshot before destructive testing.

Then use the supported uninstall/reinstall or clean-VM procedure.

Do not manually reconstruct configuration files unless the installer explicitly requires it.

Run:

```bash
sudo bash deployment/ubuntu/packages.sh
sudo bash deployment/scripts/railway-setup
```

Restore the exported configuration using the project's supported restore mechanism.

Re-enter protected credentials when prompted/required.

## Verify

Expected:

```text
station identity restored
licence restored and VALID
display configuration restored
Platform operational
Coach operational
NTES credentials re-entered
Admin credentials re-entered
```

If the current implementation does not yet provide a supported export/restore command, record this as a BUILD gap and do not create an undocumented manual workaround merely to pass the test.

# 36. Firewall Test

Run:

```bash
sudo ufw status verbose
sudo ss -lntp
```

Desired topology:

```text
LAN
 ↓
Nginx
 ↓
localhost application services
```

Not:

```text
LAN
 ↓
direct Node service ports
```

---

# 37. Time Synchronization Test

The appliance clock drives platform hide/show (server `Date`) and must stay within **2 seconds** of NTP. Chrony Leap **Normal** is not enough — after a UTM pause the guest can be hours off while Leap still says Normal.

GitHub `deployment/ubuntu/install.sh` **fails** unless:

- timezone is `Asia/Kolkata`
- chrony is active with `makestep 1.0 -1` (step any offset, including after VM pause)
- `zasya-railway-time-sync.service` is enabled (runs a step before NTES on boot)
- `|NTP offset| ≤ 2s`
- `/health` reports `timeSync: healthy`

Run on the appliance:

```bash
sudo /usr/local/sbin/zasya-railway-time-sync
sudo railway-acceptance timesync
timedatectl
chronyc tracking
```

`railway-acceptance timesync` is a **FAIL**, not a warning, if Leap is not Normal or the offset is too large.

Health exposes `systemTime`, `lastTimeSync`, `timeSync`, `clockOffsetSeconds`, and `timezone`. A large offset is `degraded` even when Leap is Normal.

If NTP is unreachable at **boot**, the oneshot unit warns and still lets displays start (station may be offline). **Install from GitHub** requires a working NTP path and will not complete with a wrong clock.

---

# 38. Log Rotation / Disk Protection Test

The appliance is expected to run unattended for long periods.

Verify that log rotation is configured:

```bash
sudo logrotate -d /etc/logrotate.conf
```

Also inspect the Railway-specific log configuration:

```bash
ls -la /etc/logrotate.d/
```

Identify the actual Railway log configuration.

For a controlled test, generate enough application log volume to trigger rotation without filling the VM disk.

Verify:

```text
log rotation occurs
old logs are bounded/retained according to configuration
active logs remain writable
disk usage remains controlled
```

Do not disable log rotation or manually delete logs and call the test successful.

# 39. Chromium Test

Check:

```bash
which chromium
```

or:

```bash
which chromium-browser
```

depending on the environment.

Verify the minimal graphical dependencies required by the appliance are installed.

Desired flow:

```text
Ubuntu boot
 ↓
graphical environment
 ↓
Chromium
 ↓
/platform
```

---

# 40. Chromium Watchdog Test

If Chromium is managed by systemd/watchdog:

1. Start the appliance.
2. Confirm Chromium is running.
3. Terminate Chromium.
4. Verify automatic restart.
5. Verify it returns to the configured display URL.

Do not implement DOM-level browser health monitoring for this test.

---

# 41. HDMI Limitation

A VM cannot fully validate:

```text
Ubuntu
 ↓
physical HDMI
 ↓
TV
```

## VM can validate

- Ubuntu installation
- application installation
- systemd
- networking
- Nginx
- NTES service
- Platform
- Coach
- Admin
- licence
- process isolation
- reboot
- firewall
- SSH
- filesystem permissions
- Chromium startup logic

## Physical hardware must validate

- physical HDMI
- TV resolution
- GPU/driver compatibility
- TV EDID behaviour
- power-cycle behaviour
- physical network interface
- Railway MPLS interface
- long-running appliance behaviour
- architecture-specific package/binary behaviour, including Chromium builds and any native Node modules

---

# 42. VM Snapshot

Once these are working:

```text
Ubuntu installed
packages installed
application installed
licence valid
services running
```

take a VM snapshot.

Use it as the rollback point for destructive testing.

Then test:

```text
NTES failure
service crash
licence failure
firewall
reboot
configuration changes
```

---

# 43. Recommended Execution Sequence

## Phase A — Ubuntu

```text
Ubuntu installation
 ↓
SSH
 ↓
network
```

## Phase B — Application

```text
repository
 ↓
npm install
 ↓
npm test
```

## Phase C — Appliance

```text
packages.sh
 ↓
licence
 ↓
railway-setup
```

## Phase D — Runtime

```text
systemd
 ↓
Nginx
 ↓
NTES
 ↓
Platform
 ↓
Coach
 ↓
Admin
```

## Phase E — External access

```text
Mac
 ↓
VM IP
 ↓
Platform / Coach / Admin / Health
```

## Phase F — Reliability

```text
reboot
 ↓
service recovery
 ↓
Chromium
```

## Phase G — Failure testing

```text
licence lifecycle
 ↓
NTES failure/recovery
 ↓
process failure/recovery
 ↓
firewall
 ↓
permissions
```

---

# 44. First VM Gate

Do not proceed through the entire plan blindly.

First gate:

```text
Ubuntu VM
+
SSH
+
network
+
correct architecture
+
Node
+
repository
+
npm test
```

Only after this passes proceed to appliance installation.

---

# 45. Second VM Gate

After `railway-setup`:

```text
Licence VALID
NTES connected
Platform running
Coach running
Admin running
Health responding
Nginx working
systemd managing services
```

Only then proceed to failure/recovery testing.

---

# 46. Third VM Gate

Before declaring the VM successful:

```text
Reboot works
Process isolation works
Automatic recovery works
Licence lifecycle works
Admin security works
Firewall works
Chromium startup works
```

---

# 47. VM Completion Criteria

The VM test is successful only when:

```text
Clean Ubuntu Server
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
Nginx running
       ↓
Chromium running
       ↓
Reboot tested
       ↓
Failure/recovery tested
       ↓
Licence lifecycle tested
       ↓
Security checks tested
```

and the system operates locally without depending on Zasya cloud services.

---

# 48. What a Successful VM Means

A successful VM result means:

> The software appliance path is sufficiently validated to justify moving toward physical Ubuntu hardware testing.

It does **not** mean Railway deployment is production-proven.

The next validation stage still requires:

```text
Physical PC
+
Ubuntu
+
HDMI TV
+
Railway network
+
MPLS
+
NTES
+
24/7 operation
```

---

# 49. Immediate First Actions

Start with:

```bash
uname -m
```

Create the UTM VM using the matching Ubuntu Server architecture.

After Ubuntu installation:

```bash
uname -m
lsb_release -a
node --version
npm --version
hostname -I
```

Then inside the repository:

```bash
npm test
```

The current known-good baseline is 24 passing tests.

The number is expected to grow as legitimate tests are added. Treat the latest known-good repository state as the baseline rather than requiring the count to remain exactly 24.

Do not proceed to `packages.sh` or `railway-setup` until this first gate passes.

---

# 50. Failure Reporting Format

When a step fails, report:

```text
STEP:
...

COMMAND:
...

EXPECTED:
...

ACTUAL:
...

LOG:
...

IMPACT:
...

NEXT ACTION:
...
```

Do not manually workaround an appliance failure and then declare the installer successful.

The purpose is to validate the **repeatable installation path**, not merely to get one VM running.

---

# 51. Final Principle

The VM is the bridge between:

```text
Developer laptop POC
```

and:

```text
Railway physical appliance
```

Prioritize:

```text
repeatability
+
installation correctness
+
service recovery
+
network isolation
+
licence correctness
+
operational diagnostics
```

over cosmetic optimization.

The objective is not simply:

> "The application runs on Ubuntu."

The objective is:

> **A clean Ubuntu Server machine can be converted into a reliable Railway appliance using the defined installation process, and the appliance survives normal operational failures without developer intervention.**
