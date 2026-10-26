# Q02 support S3 candidate — 2026-10-16

Source fence: branch `feat/yqaa-q02-support-membership-reciprocal-20261016`, HEAD/base `45c143d617e1131224bab70f38de7ea8c50eac6b`, lease `c275a8ee8c01ea6ebe08255b9bc0a983`. S2 predecessor terminal attempt supplied by supervisor: `62ee00e3e31248f196da03fd5cdde629`, EXITED 0; not independently queried. S2 files were present as untracked source at entry. 014/015, visitor controls, ES256 implementation and routes preserved. Existing runtime-wiring assertions extended for S3. No S1/S2 workspace, portal, worker, receipt, canonical checkout, production database or deployment modified. No release receipt is issued. Q01 remains active; Q03 remains on hold. Anonymous response defect is outside scope.

## Authority and enrollment

Inspected `lib/auth.ts`, `lib/clerk-session.mjs`, `lib/support-profile-policy.mjs`, `lib/supabase/server.ts`, migration sequence through 015 and privacy modules. Strict privacy authentication still locally verifies Clerk signature with pinned JWT key, exact server-configured issuer, support authorized party, unexpired immutable sub and sid. Shared profiles explicitly share a Clerk instance/portal table and permit staff email relinking. They are NOT privacy authority. No independent authoritative product site/tenant membership was proven in this source. No claim about actual live Clerk instance ownership is made.

Additive 016 defines independent version-1 deployment and membership registries. Empty by construction. Environment `Q02_SUPPORT_SCOPE_VERSION=1`, `Q02_SUPPORT_SITE`, `Q02_SUPPORT_TENANT` selects a fixed scope; environment alone grants nothing. A matching managed DB deployment and exact immutable-sub enrollment must exist. No tenant or identity is accepted from JSON, email, staff role, shared profile, visitor token, Host, or forwarded headers. Composite PK forbids duplicate current membership; malformed/array/multiple-row adapter results deny. Different tenants and subjects deny.

Managed enrollment contract: a separately authorized DBA verifies immutable Clerk issuer/sub provenance and contractual site/tenant ownership out of band, records a reviewed enrollment reference, and provisions deployment plus exact subject rows in a controlled transaction. No application or browser enrollment endpoint exists; service_role has no direct registry table writes. Do not seed from profiles or webhook signups. Require approval/evidence and a second reviewer before enrollment. Deployment issuance defaults false. Runtime signing remains hard-disabled, independent of registry issuance. No live enrollment performed.

Membership statuses are active/suspended/revoked. Keep enrolled rows and deployment scope permanently available for lawful authenticated review/withdrawal; never delete or reassign them on suspension, revocation, key rotation, or feature disablement. Revoked membership does not permit future use. Withdrawal requires the same verified subject, retained membership, and epoch CAS, but bypasses issuance/status restrictions. Missing membership still denies; emergency recovery requires a separate managed identity-verification procedure, never email relinking. Database guards obtain deployment then membership share locks inside EVERY review/transition, serializing status updates against effects. DB owner administrators must follow this lock order for multi-row enrollment updates. Underlying 014/015 functions are renamed internal and service execute revoked. Guarded RPC prohibits consume entirely. Consent epoch row locks/CAS and durable outbox remain from 014. No outbox delivery worker exists; no propagation success claimed.

## Adapter and API behavior

Runtime instantiates existing service client only after syntactically valid fixed scope. Missing credentials, schema, deployment or enrollment yields uniform denial. Actual `.mjs` membership/store modules are tested with disposable RPC mocks. RPC wrappers independently recheck membership, including withdrawal, and do not rely on application lookup freshness. Application checks status/capability too. Streamed 2048-byte bound, exact opt-in/disclosure/scopes, origin CSRF checks, no-store responses and raw-ID/transcript exclusion are preserved. Missing transition/withdrawal adapter prevents grant/issuance. Review availability accounts for suspended/revoked membership. No local fallback or automatic grant. Scope variables represent operator assertions until independently reviewed provisioning; they are not proof of product tenancy.

## Portal V7 bounded writer handoff: two-sided protocol

`lib/privacy/reciprocal.mjs` is offline verifier scaffolding, NOT route authorization. `inspectReciprocalReceipt` verifies pinned ES256 portal receipt and original support signature, then returns redemption DENY even for valid signatures. `redeemReciprocal` always throws. Account redeem remains denied. No live portal keys, source, online epoch service, or trusted challenge ledger were available. Do not activate via flags.

V7 must implement and separately review all of the following before a new support writer can authorize redemption:

1. Independently authenticated portal session, locally verified Clerk issuer and literal portal azp, immutable sub/sid/expiry. Clerk issuer may be shared only if independently proven; azp must remain separated. Never accept support cookies as portal sessions or request JSON as identity. Proof signing issuers are distinct literal HTTPS origins, separate from Clerk issuer. Literal configured audiences must match the receiving origin exactly; no wildcards, Host-derived audiences, discovery, or cross-site redirects.
2. Generate a random 256-bit, short-lived single-use challenge under the verified portal session, bind it to portal subject, tenant, both sites and exact granular portal opt-in/disclosure version. Store only server-side session binding/digest as appropriate. Support S2 intent signs support sub, site, tenant, support epoch/version, sorted scopes, challenge nonce, JTI and <=120s timestamps. Neither signature alone grants linking.
3. Pin separate P-256 asymmetric public keys by issuer/kid/purpose and environment; no token-supplied jku/x5u, symmetric keys or remote fallback. Maintain a reviewed allowlist and bounded overlap rotation; reject unknown/revoked kids. Revoke affected pending proofs on compromise. Scaffolding supports one explicitly pinned kid per side; rotation registry is remaining work.
4. Portal reciprocal payload is exact: `v,iss,aud,support_sub,portal_sub,support_site,portal_site,tenant,support_epoch,portal_epoch,support_consent_version,portal_consent_version,scopes,challenge,support_jti,support_digest,jti,iat,nbf,exp,purpose`. Use v=1, purpose=`account-memory-link-reciprocal`, header `{alg:ES256,typ:q02-portal-reciprocal+jwt,kid}`. `support_digest` is base64url SHA-256 of exact compact support JWT bytes; bind its exact support JTI too. Both immutable subjects must be signed. Independent consent epochs are not interchangeable. Receipt expiry cannot exceed support expiry. No sid, emails, transcripts or unrestricted metadata in proofs. Proofs contain personal identifiers: transfer only in bounded POST body, never URL/logs/analytics/storage readable by third parties. UI/API must not echo raw subjects; proof is the sole intentionally signed identity envelope.
5. Verify BOTH signatures, both current authoritative memberships, both versioned active consents and exact scopes/epochs online at consumption. A signed positive portal_epoch is NOT evidence that it remains current. Require a pinned authenticated service channel and independently verified online epoch responses; network errors deny. Implement a durable transaction/coordinator that atomically consumes challenge, support JTI/digest and portal receipt JTI and binds the exact pair/epochs before any link or derived data use. Unique constraints, CAS, expiry, replay/retry and simultaneous requests must fail closed. The old internal consume RPC is not a substitute. No distributed check-then-write gap: explicitly specify coordinator and withdrawal race semantics before implementation.
6. Withdrawal/revocation increments local epoch and writes durable outbox tombstone; deliver signed idempotent events with fixed audiences, both site bindings and monotonically checked epoch, durable ack/retry and suppression. Until ack/current epoch independently confirmed, derived use denies. Check both current epochs before every derived use; offline cached consent never authorizes. Preserve tombstones/JTI replay protection past all proof/retry horizons and prevent resurrection after backup restore. Define/legal-review exact retention and deletion policy before activation; transcripts/commercial/legal records are separately retained. Forget remains unavailable; withdrawal never claims deletion. Worker implementation belongs to a separate authorized scope.

The executable vector generates two unrelated disposable keypairs and signs both immutable subjects; it is a test recipe, not a live trust anchor. It rejects wrong audience, support epoch, invalid portal epoch, digest/JTI, subject, tenant, challenge, expiration, missing key and forged signature. Repeated redemption is always denied. Positive portal epoch freshness, atomic cross-site replay consumption, rotation, propagation delivery and concurrency remain acceptance gates, not implemented capabilities.

## Deterministic verification and limits

Commands run in S3 without install/external models. Exact final TAP summaries:

`node --test tests/q02-support-*.test.mjs tests/widget-auth.test.mjs`

```text
1..85
# tests 85
# suites 0
# pass 84
# fail 0
# cancelled 0
# skipped 1
# todo 0
# duration_ms 103.378708
```

`node --test tests/*.test.mjs`

```text
1..121
# tests 121
# suites 0
# pass 119
# fail 1
# cancelled 0
# skipped 1
# todo 0
# duration_ms 361.806875
```

Failure: existing `tests/clerk-session.test.mjs` cannot import absent `@clerk/backend` (`ERR_MODULE_NOT_FOUND`), before tests execute. No dependency installation permitted. No assertion regression observed in executable S1/S2 tests; full suite success is NOT claimed.

`Q02_NATIVE_SQL=1 node --test tests/q02-support-native.test.mjs`: 1 test, 0 pass, 1 fail, 0 skipped. Disposable `initdb` fails with `FATAL: could not create shared memory segment: Operation not permitted`, `shmget(... size=56 ...)`; also fails with mmap/posix configuration. No migrations executed. Temporary cluster directories removed. Harness uses its own socket-only temporary cluster, takes no DB URL and never connects to production. Native SQL covers restricted table/internal RPC permissions, browser RPC denial, active grant, other tenant, duplicate enrollment, stale CAS, consume denial and suspended/revoked withdrawal. Must pass in an authorized disposable PostgreSQL environment before acceptance. Extend it with concurrent revocation/withdrawal/reservation transactions and duplicate nonce/JTI races before live approval.

`git diff --check`: passed. Next dependency tree and `node_modules/next/dist/docs/` absent; relevant Next guide could not be read. No new Next API conventions introduced. No build/typecheck, live Clerk verification, browser/real users, actual migration, production access, deployment, release or Jev gate performed. User explicitly prohibits external models, overriding global Jev invocation. Source provenance/terminal lease not independently verified with orchestrator. This is candidate source, not autonomous production completion.

## Release, rollback and authenticated live acceptance gates

- Separate release authority verifies source fence/lease, reviews complete diff including inherited untracked S2 files, provisions dependencies by approved workflow, reads installed Next docs, runs build/typecheck and full offline/native suites. Audit function owners/grants and lock/concurrency behavior on target-compatible disposable PostgreSQL. Preserve 014/015 ordering and backups. Never apply only 016 without its predecessors.
- Review authoritative scope and enrollment evidence with designated data owner. Missing credentials/enrollment remains DENIED. Run authorized migration/provisioning only in a later bounded task. Preserve no grants by default. Runtime signing cannot be activated by this candidate's environment.
- Portal V7 writer implements above contract in separate bounded source; support writer then integrates independently pinned verification and online authority, coordinator/replay constraints, propagation and legal retention. Security review and disposable integration races required before any redemption activation.
- In a separately authorized authenticated test environment use synthetic accounts: prove valid Clerk issuer/azp/sub/sid, no session, forged/expired session, wrong tenant, no enrollment, suspended, revoked, missing/rotated keys, wrong audience, stale epochs, simultaneous/reused proofs and cross-site CSRF all deny. Prove suspension/disabled issuance still permits withdrawal and subsequent derived use denies on both sites. Verify outage fail-closed, tombstone replay/restore behavior and legal retention UI. Never use real-user browser sessions for this work.
- Rollback issuance first (keep withdrawal paths and registry/tombstones intact); leave redemption denied, stop derived use, revoke compromised signing keys and invalidate pending proofs. Do not drop membership/consent/outbox tables or restore permissive 014 RPC grants. Prefer forward corrective migration. An older application rollback must retain the guarded database wrappers and legal withdrawal availability. No rollback executed here.
