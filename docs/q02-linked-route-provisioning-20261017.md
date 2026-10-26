# Q02 linked route source and external provisioning

This source adds the positive **linking** path. It does not enable cross-site
memory retrieval/use, correction or forget. Existing conversation memory and
anonymous/widget boundaries retain their independent contracts. No external
provisioning, deployment, bootstrap, credential rotation or production write was
performed by this source task.

## Routes and consent

Support UI: `/account/reciprocal-consent`, also linked in the existing staff
sidebar. Portal UI: the existing `/account/reciprocal-consent` page. The Support
page is outside the profile-dependent dashboard layout. API authority never uses
a profile, email, staff role, Host or X-Forwarded-Host.

Support API: `/api/privacy/account/{review,grant,withdraw,issue,stage,event,ack,consume}`.
The old `redeem` URL aliases `consume`. Portal: `/api/privacy/reciprocal`; GET
reviews, POST includes `action` and the operation fields. Both use the same
server handler. `forget` responds unavailable and never deletes records.

Both users opt in to the exact version and both scopes (`derived_summary`,
`preferences`). Support opens the fixed Portal origin, and the Portal user starts
a challenge. Only the explicitly opened window and the pinned paired origin can
receive browser messages. JWTs, proofs and ACKs stay in browser memory: no URL,
localStorage, BroadcastChannel or logging transport. Each user sees the staged
event digest and explicitly acknowledges that event at their own site. Portal
acknowledges first, then Support. The two dedicated servers independently verify
peer signatures and live sessions; each records only its own ACK. The coordinator
has no enrollment or ACK grants. Consent and intent lifetime is at most 120s;
the stage's service proof lasts at most 30s, also bounded by both session/proof
expiries. If the user takes too long, restart the linking flow.

All POST bodies use canonical `JSON.stringify` encoding; duplicate fields, ambiguous
encodings, unknown keys and streamed bodies over 64 KiB deny.

Signing and session enrollment are real runtime operations. There is no
`Q02_*_SIGNING_ENROLLED` marker. Availability requires a current registered DB
key, a successful private-key signing challenge, exact live JWT/Clerk session
enrollment, managed subject membership, active site registration, and disjoint
site/service key material. `available`/`issuanceAvailable` describe this site's
issuance capability. `linkingAvailable` remains false in review: a review cannot
attest a future two-party commit. `LINKED` is returned only after the actual
checkpoint-fenced transaction commits, and always carries `derivedUse:false`.
Missing coordinator binding, database, trust, signer or session denies the
relevant operation. There is no in-memory production fallback or auto-ACK.

## Apply externally, in dependency order

Use an independently controlled database administrator, never a public request
or one of the three runtime logins. This source does not provide a bootstrap API.

1. Apply the existing Portal offer idempotency, privacy lifecycle, memory facts,
   and reciprocal migrations (ending `20261016110000_yqaa_portal_reciprocal.sql`),
   then Support `014` through `019`, then the new
   `supabase/migrations/020_q02_link_routes.sql`. These are a shared PostgreSQL
   schema despite separate apps and independently pinned parties. Review existing
   schema/role collisions before applying; 019 intentionally rejects collisions.
2. Independently register the intended tenant's random 43-character base64url
   generation and genesis in `q02_runtime.tenants` (sequence zero, head=genesis).
   Provision the same generation/genesis in the independently controlled external
   checkpoint journal. Never fabricate a successful checkpoint from DB state.
3. Register separate rows in `q02_runtime.sites` for literal `support` and `portal`:
   exact Clerk issuer and fixed party, `active=true`, nonempty enrollment reference,
   the public proof configuration below, and bounded current key manifests. A
   common Clerk issuer and Supabase DB do not merge the two authorities.
4. Register matching Support/Portal deployment rows in
   `support_privacy_deployments` / `q02_portal_deployments`. The latter must pin
   the exact issuer, Portal party and `support_site='support'`. Enable issuance
   only as the operator's explicit deployment decision.
5. Independently register each exact immutable `user_...` subject in the matching
   managed membership table, with active status and a real enrollment reference.
   Do not derive membership from email, profiles, a request body or a shared
   issuer. The site runtime may subsequently enroll only its live authenticated
   `sub`/`sid` via `enroll_session`. It stores the SHA-256 sid digest, issuer,
   party and bounded expiry. It cannot create membership or reactivate a revoked
   credential. New sessions enroll separately; unchanged enrollment is not
   updated or extended while a stage is in flight.
6. Independently register `q02_runtime.services.manifest` with the public service
   manifest below and a separate enrollment reference. Leave `use_manifest` null.
   Do not reuse either site's signing key or invent a data-use service scope.
7. Provision SCRAM credentials and database CONNECT privileges for the existing
   dedicated `q02_support_runtime`, `q02_portal_runtime`, and
   `q02_coordinator_runtime` logins. Preserve NOINHERIT, NOSUPERUSER, NOBYPASSRLS,
   no role memberships, no table grants, and only migration-granted functions.
   Use a certificate-authenticated PostgreSQL endpoint and a trusted CA, with
   `sslmode=verify-full` in each DSN. Runtime also checks `session_user` and
   `current_user` against the literal expected login. Generic `service_role`
   cannot enroll, ACK, stage or consume through these functions.
8. Install each app's pinned dependencies using its lockfile. Portal now requires
   the same `pg@8.23.1` adapter already present in Support. No other dependency
   upgrade is part of this change.

## Exact server configuration

Both apps need independently pinned verifier configurations for both sites:

- `Q02_SUPPORT_CLERK_ISSUER`, `Q02_SUPPORT_CLERK_JWT_KEY` (or Support's existing
  `CLERK_JWT_KEY`), `Q02_SUPPORT_CLERK_BACKEND_KEY`.
- `Q02_PORTAL_CLERK_ISSUER`, `Q02_PORTAL_CLERK_JWT_KEY`,
  `Q02_PORTAL_CLERK_BACKEND_KEY`, `Q02_PORTAL_AUTHORIZED_PARTY`.
- Portal party must be exactly `https://portal.yousafeconsultancy.com` or
  `https://market.yousafeconsultancy.com`; Support party is always
  `https://support.yousafeconsultancy.com`. Backend keys must permit fresh pinned
  Clerk session lookup. JWT signature and exact issuer/azp/sub/sid plus online
  active status/expiry are required on every request and again under the fence.

Each app receives only its own prefix's configuration:
`Q02_{SUPPORT|PORTAL}_SITE` (literal `support` or `portal`), `_TENANT`,
`_DATABASE_URL`, `_PROOF_KID`, `_SIGNING_PRIVATE_JWK`. Public proof keys and
registration/status come from the managed DB, not public environment variables.
DSNs may include an operator-provisioned `sslrootcert` path if required by the
provider; never override verification with `rejectUnauthorized=false`.

Support alone receives `Q02_COORDINATOR_DATABASE_URL`,
`Q02_SERVICE_PROOF_KID`, `Q02_SERVICE_SIGNING_PRIVATE_JWK`,
`Q02_CHECKPOINT_TRUST`, and the existing `Q02_CHECKPOINTS` Durable Object namespace
binding. Portal receives neither the coordinator DSN nor the service private key.
The existing `wrangler.toml` source already declares the journal; a declaration
is not a provisioned journal or a successful bootstrap. The journal's private
key, enrollment tuple and bootstrap administrator capability must be provisioned
externally to its own trusted runtime using the existing journal contract
(`CHECKPOINT_SIGNING_JWK`, `CHECKPOINT_TRUST`, `CHECKPOINT_ENROLLMENTS`,
`CHECKPOINT_ADMIN_CAPABILITY`). No route exposes bootstrap. Pin a separate journal
key and perform the existing operator-controlled bootstrap independently.

## Public registration formats (no private values)

Each key entry is exactly:
`{kid, publicJwk, revoked:false, notBefore, notAfter}`. Use P-256 public JWKs without
`d`, unique kids, integer Unix seconds, and one to four keys per manifest. All
currently registered keys must remain valid through the operation's expiry.
Keep rotation overlap bounded; revoked or expired registered keys deny.

Site `proof` is:
`{enabled:true, issuer:<site HTTPS origin>, audience:<peer HTTPS origin>, site,
tenant, kid, publicJwk}`. Portal additionally requires
`consentVersion:'portal-v7-1'`. Issuer and audience must be reciprocal and match
configured browser origins. Private keys live only in their own site's server
configuration. Each site must use different mathematical public key material.

Service `manifest` is:
`{issuer:<service HTTPS origin>, audience:<coordinator HTTPS origin>,
principal:<stable service id>, tenant, active:true, scope:'q02:link', keys:[...]}`.
Its key material must be disjoint from all site proof keys.

Checkpoint trust is:
`{kid, issuer, audience, publicJwk, revoked:false, notBefore, notAfter}`.
Its independently approved external generation/genesis must match the initial
DB generation/genesis. A rollback, conflicting head, stale proof, reused nonce,
missing ACK, revoked credential/key, changed epoch or unconfirmed COMMIT denies.

## Host acceptance (not child-side listeners)

Run from the Support worktree with Node 22 and native PostgreSQL/OpenSSL in PATH:

```
node scripts/test-q02-runtime-authority-postgres.mjs
node scripts/test-q02-link-routes-postgres.mjs
node tests/q02-checkpoint-miniflare.test.mjs
```

The first is the inherited 019 SQL setter/head/freshness/nonce/rollback/revocation
suite. The second is the new 020 route path using disposable SCRAM logins and
actual verify-full TLS through the unmodified production pg connection adapters.
It covers exact live enrollment, real signing, both opt-ins, durable intent,
receipt, checkpoint reconciliation, committed stage, independent event tickets,
signature failure rollback, both site ACKs, consume, replay, withdrawal and
non-revivable revoked enrollment. Its Clerk transport and signed checkpoint are
explicit synthetic fixtures. The third separately exercises the real workerd
Durable Object restart/CAS/signature behavior. None accepts a production DB URL.
The root must run these host checks before treating SQL020 or browser flow as
accepted; source syntax and portable tests are not a substitute for native SQL.
