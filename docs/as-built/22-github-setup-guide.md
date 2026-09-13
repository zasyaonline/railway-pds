# 22 — GitHub Setup Guide

## Repository

This project is already a git repo (`railway-pds`). For a **new** remote:

```bash
git remote add origin git@github.com:<ORG>/railway-pds.git
git push -u origin HEAD
```

## Branch strategy (recommended)

| Branch | Purpose |
|--------|---------|
| `main` | Production default (scheduled Actions run here) |
| `feature/*` | Feature work (e.g. historic `feature/coach-position`) |

Protect `main`: require PR reviews; restrict force-push.

**Note:** GitHub scheduled workflows only run on the **default** branch. Coach refresh cron must be on default branch to fire.

## SSH

```bash
ssh-keygen -t ed25519 -C "you@example.com"
# Add public key to GitHub → SSH keys
ssh -T git@github.com
```

## GitHub Actions secrets

Settings → Secrets and variables → Actions:

| Secret | Purpose |
|--------|---------|
| `AWS_ACCESS_KEY_ID` | Deploy / publish |
| `AWS_SECRET_ACCESS_KEY` | Deploy / publish |

Least-privilege IAM user recommended.

## Workflows in repo

1. `deploy.yml` — manual deploy
2. `coach-refresh.yml` — backup Coach cache every 5 minutes

## Push checklist

- Do not commit `.aws/` credentials, `.env`, private keys, ChatGPT PNGs with secrets
- Prefer conventional commits; do not rewrite published history on `main`
