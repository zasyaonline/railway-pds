# 19 — User Management

## Status

**No user management subsystem** exists (no signup, profiles, password reset, user table).

## Actor model (as-built)

| Actor | How represented |
|-------|-----------------|
| Passenger / viewer | Anonymous browser tab |
| Operator | Holder of admin key |
| Deployer | AWS IAM user/role + GitHub secrets |

## Session entities (not users)

Viewer sessions are **device/tab heartbeats**, not authenticated end-users. Fields: `id`, `startedAt`, `lastSeenAt`, `userAgent`, `killedAt`.

## Safe credential placeholders

| Context | Identifier | Secret |
|---------|------------|--------|
| Local PDS admin | Admin key field | `<SET_LOCALLY>` |
| Local Coach admin | Admin key field | `<SET_LOCALLY>` |
| Production | Lambda env keys | `<SET_IN_AWS>` |

Default key **names** appear in READMEs for local demos only; treat production values as confidential.
