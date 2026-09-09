# Ubuntu VM appliance automator

Mac-side scripts that install Railway Local MVP on a **clean Ubuntu Server 24.04** guest in UTM. Proof is nginx on port 80 from the Mac browser, **not** `npm start`.

## One command

```bash
brew install xorriso
brew install --cask utm
bash deployment/vm/run-all.sh
```

This runs, in order:

1. `npm test` on the Mac
2. Download Ubuntu Server 24.04 ISO for this Mac’s architecture (cached under `deployment/vm/.cache/`)
3. Build CIDATA + remastered autoinstall ISO (`brew install xorriso` required for unattended install)
4. Create UTM VM `railway-vm` (4 CPU / 6 GB / 40 GB, Shared/NAT, QEMU+hypervisor = Virtualize)
5. Wait for SSH after autoinstall
6. `rsync` the repo, issue the licence **on the Mac**, run `packages.sh` then `npm test` then `railway-setup --non-interactive`
7. Curl `http://<VM-IP>/{platform,coach,admin,health}` and SSH `acceptance.sh all`

On failure the scripts print STEP / COMMAND / EXPECTED / ACTUAL / LOG / IMPACT / NEXT ACTION.

## After a green run

| Surface | URL |
|---------|-----|
| Platform | `http://<VM-IP>/platform/` |
| Coach | `http://<VM-IP>/coach/` |
| Admin | `http://<VM-IP>/admin/` |
| Health | `http://<VM-IP>/health` |

SSH:

```bash
ssh -i deployment/vm/.cache/zasya-railway-vm zasya@<VM-IP>
```

Guest password (first boot only) is in `deployment/vm/.cache/zasya-password`. Admin password is in `deployment/vm/.cache/admin-password`. The **licence private key stays on the Mac** (`keys/` or `.zasya/keys`); it is never copied to the VM.

## Individual scripts

| Script | Role |
|--------|------|
| `download-iso.sh` | Ubuntu 24.04 live-server ISO + SHA256 |
| `build-autoinstall-iso.sh` | nocloud CIDATA + remastered ISO with `autoinstall` |
| `create-utm-vm.sh` | Create/start `railway-vm` (`--recreate` to replace) |
| `wait-ssh.sh` | Poll until `zasya@VM` accepts the automator key |
| `provision.sh` | rsync, Mac-issued licence, packages, tests, `railway-setup` |
| `verify-from-mac.sh` | LAN curls + acceptance suite |
| `run-all.sh` | Orchestrator (`--skip-create` if you built the VM in the UTM GUI) |

## Prerequisites

- macOS with Apple Silicon or Intel (native arch, do not emulate x86 on ARM)
- [UTM](https://mac.getutm.app/) 4.7+ (`brew install --cask utm`)
- `xorriso` for unattended Ubuntu (`brew install xorriso`)
- Node 22+ for `npm test` (Node 26 is fine; do not use `node --test tests/`)

## Notes from the first Mac deploy

- UTM cannot read ISOs from the git checkout (sandbox). `create-utm-vm.sh` copies media into `~/Library/Containers/com.utmapp.UTM/Data/Documents/zasya-railway-media/` as a **full copy** (not APFS clonefile).
- Apple Virtualization backend failed to attach those ISOs (`OSStatus -2700`). QEMU with `hypervisor:true` (still hardware virtualization) worked.
- UTM’s default QEMU guest has **no graphics card**, so the main window stays grey. The installer runs on serial (`utmctl attach railway-vm`). `create-utm-vm.sh` now adds `virtio-ramfb` and copies the ISOs into the `.utm` bundle. Re-run `bash deployment/vm/create-utm-vm.sh --fix-display` if an older VM is still blank.
- Shared-network IPs move (for example `.2` then `.4`). Do not hard-code `192.168.64.2`.
- `curl --retry` on macOS/bash aborted a completed 2.8 GB download with `retry: command not found`. The downloader no longer uses `--retry`.
- Autoinstall takes on the order of 10–20 minutes before SSH answers.

Do not use `npm start` on the VM. Do not copy `licence-private.pem` onto the appliance.
