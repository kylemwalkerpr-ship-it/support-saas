# Q02 support privacy contract — 16 October 2026

Status: bounded source candidate, disabled and unwired. Coding completion is not Q02 release or production readiness. No portal code changed. No account/memory linking is enabled.

Fence: support worktree `yqaa-yqaa-q02-support-privacy-attestation-20261016-s1`, branch `feat/yqaa-q02-support-privacy-attestation-20261016`, inspected HEAD `45c143d617e1131224bab70f38de7ea8c50eac6b`. Writer lease supplied by supervisor: `51eac644ebf36c967bd4f2cad1757551`; not modified or independently validated. No commit, push, PR, deployment, network, dependency installation, real key access or existing database operation occurred. No new worker or paid/external model was launched; Jev was not called because this mission prohibits external models/network.

## Implemented and deliberately unavailable

`lib/privacy/attestation.mjs` implements dependency-free WebCrypto P-256 ES256 signing and strict verification. Its config requires literal `enabled: true`; absence fails closed. There is no environment loader, route, UI, database adapter, public key endpoint or linking consumer. Runtime activation is therefore unavailable even if an environment flag is set. No Next API was changed: dependencies and the required installed Next documentation are absent.

The trusted server caller must supply a currently verified Clerk session (`sub`, `sid`) and independently resolved immutable site/tenant membership. Those arguments are security boundaries, not client input or self-verifying objects. The existing `getClerkUserId`/Clerk verifier remains unchanged; it does not currently supply authoritative tenant membership. Never use `getOrCreateProfile` email relinking as linkage authority. The inspected support schema has no authoritative site/tenant membership model; this is a release blocker, not a reason to infer one.

`DISCLOSURE` is the versioned copy a future UI must visibly render before opt-in. No UI exists yet and no claim of visible consent capture is made. The UI must present independent unchecked controls for `preferences` and `derived_summary`, an explicit affirmative submission, retention limits and 120-second proof expiry. Consent is revocable. Transcript/commercial/legal audit deletion is not promised. No transcript, message, email, visitor name or chat ID belongs in this proof.

`lib/privacy/visitor-controls.mjs` is an isolated helper, not a new endpoint. It authorizes using the existing chat capability before returning limited privacy status. Wrong/missing token, wrong thread and unknown UUID receive the same 404. It reports no account link and refuses forget with 409 because retention policy is missing; it does not mutate chats. Existing widget transcript access, staff rights, storage, CORS and answer generation are unchanged. A stolen chat token can still access that one chat; this work cannot distinguish its thief from its holder and never upgrades it to account identity. Clerk logout prevents future account issuance only when a future caller supplies the current verified session; it does not revoke independently held visitor capabilities.

## Signed wire schema and portal consumption contract

Compact JWS: base64url without padding, three segments, UTF-8 JSON, raw 64-byte P-256 signature over ASCII `header.payload`. Header has exactly `alg: ES256`, `typ: q02-support-intent+jwt`, `kid` (configured). Reject other algorithms, key types, curves, private verification keys, unknown fields and noncanonical base64url. JSON is checked by parse/re-serialization; duplicate members, whitespace and alternate escaped spellings cannot pass the canonical check. The issuer's emitted property order is the order below; a verifier must verify the exact received bytes, not normalize and then verify.

| Claim | Contract |
| --- | --- |
| `v` | integer 1 |
| `iss`, `aud` | configured distinct exact HTTPS support/portal origins; no request-derived host |
| `sub` | immutable verified support Clerk `user_…` subject; not a portal subject |
| `site`, `tenant` | server-authorized support site and tenant identifiers |
| `purpose` | exactly `account-memory-link-intent` |
| `scopes` | nonempty unique sorted array from `derived_summary`, `preferences`; these are the permitted data classes |
| `nonce` | 32 random bytes, 43-character base64url portal challenge |
| `jti` | independent 32-byte random unique issuance identifier |
| `iat`, `nbf`, `exp` | integer epoch seconds; `iat = nbf`, `0 < exp - iat <= 120`; no clock grace, reject before nbf and at/after exp |
| `epoch` | positive integer consent generation |
| `consent_version` | exactly `q02-support-v1` |

Future private runtime configuration: `enabled`, `issuer`, `audience`, `site`, `tenant`, `kid`, `privateJwk` for the issuer. Use a separately provisioned site-private EC P-256 signing key, never a Clerk, visitor or portal private key. The verifier receives only pinned `publicJwk` and the same expected identities. No real key or sample reusable secret is included. Missing key fails closed before durable reservation. A signing failure after reservation burns the intent; never retry with the same nonce/JTI.

Public-key distribution is NOT implemented. Before enabling, provision portal trust out of band with an approved exact support issuer/site/tenant-to-kid/public-key mapping. Never follow token `jku`/`x5u`, accept a key supplied by the requester, or trust arbitrary discovered issuers. Rotate using reviewed overlapping public keys for outstanding proof lifetimes; invalidate compromised keys immediately. The current verifier pins one key; multi-key rotation needs implementation and tests.

Portal MUST independently verify its own current authenticated session, capture its own granular consent, and persist the nonce bound to that portal subject/session, expected support site/tenant, scopes, purpose, expiry and single-use state. Support proof cannot select or establish a portal member identity. No matched email, visitor token, UUID, staff/provider role or signature-only bearer acceptance. Do not place proofs in URLs, logs, analytics or persistent browser storage.

After local signature/claim checks, portal needs an authenticated, separately signed two-party redemption request binding its own issuer, audience, portal subject, support proof digest/JTI, challenge, tenant/site, scopes, epoch and fresh time/replay identifiers. That reciprocal schema, trust provisioning and endpoints are intentionally NOT invented here. Until independently specified, implemented and tested, reject redemption and create no link. `verifyIntent` returns validated claims only; it does not consume, authorize, or link.

## Candidate durable lifecycle

Migration `014_q02_support_privacy_contract.sql` is additive and unapplied. New tables have RLS enabled, no browser policies, and no direct grants to anon/authenticated/service_role. Only the security-definer transition RPC is executable by service_role. RPC owner must be a controlled migration role; production privilege/default-grant inspection is still required. Existing chat RLS was not expanded or rewritten.

Consent identity key is `(site, tenant, subject)`. Initial epoch 0 is withdrawn. `grant` requires explicit scopes and expected epoch, increments epoch, and records an active event. `withdraw` increments epoch, clears scopes and keeps a durable tombstone plus outbox event. Repeated withdrawal with a stale expected epoch fails CAS; a client must re-read current state. Re-consent requires a new visible opt-in and current epoch; it cannot resurrect an old proof.

`reserve` checks active consent, exact scopes/epoch and bounded issue/expiry time under the same row lock, then inserts unique JTI and unique per-subject challenge. `issueIntent` requires an async `store.reserve(claims)` returning literal true before signing. A future adapter must map ALL claims to the fixed deployment identity plus RPC arguments, bind stored consent to the current verified session, and reject any mismatch; no memory fallback. `consume` checks current consent epoch/scopes plus unconsumed unexpired JTI/challenge and updates once atomically. All actions acquire the consent row lock, serializing withdrawal with reservation/redemption. No anonymous/authenticated direct RPC access is allowed. This is a candidate SQL implementation, not a tested live service adapter.

There is no transcript/global deletion, backfill, inferred visitor ownership or deletion of legal/commercial records. No retention cleanup job is included. Tombstone/JTI/outbox retention and abuse/resource limits need approval before exposure.

Outbox events are durable but no dispatcher, event-signing key, acknowledgement, retry or delivery endpoint exists. Future consumers must use signed authenticated events, apply only monotonically increasing epochs, deduplicate, and suppress derived memory on withdrawal. Never rely on asynchronous events alone: all derived reads/writes/jobs must check current consent epoch at the effect boundary. A cached active result cannot authorize a late effect after withdrawal. Unknown status or unavailable support authority denies use. Cross-service atomic effects, cache invalidation, re-consent ordering and reconciliation remain unimplemented gates. Existing narratives are not wired to this state and are not claimed to be suppressed by this candidate.

Account-authenticated review/withdraw/forget endpoints and the user interface are also absent. Service-only RPC has no read endpoint; do not grant broad table access as a shortcut. Approve a narrowly scoped current-subject read RPC and independently verified API adapter before integrating. Where transcript retention and authority are unresolved, deletion must stay unavailable.

## Verification and remaining gates

Node v22.22.2 offline checks:

- 65 passed, 0 failed, 0 skipped across new privacy tests and existing widget-auth, support-profile-policy, edge-guard, support-known-routes, auth-links-market-modal, language-picker-layout and ai-discoverability-contract suites.
- New privacy suite includes real ephemeral WebCrypto key generation/sign/verify, forged and validly signed invalid claims, expiry/nbf, missing/foreign issuer/audience/site/tenant/kid/JTI/challenge, disabled/missing key, denied consent/scopes, logout/missing session, subject mismatch, replay, stale epoch, concurrent withdrawal and late signing effects. Visitor tests cover wrong/missing/cross-thread capability and retention refusal.
- The lifecycle adapter in tests is synthetic. SQL tests inspect source invariants only. Neither proves PostgreSQL syntax, transaction concurrency, schema compatibility, privileges or RLS execution.
- Attempted existing Clerk suite failed to load because `@clerk/backend` is missing. The initial combined run was 42 passed and one failed test-file load. That failure remains unresolved; no dependency was installed. No Clerk cryptographic integration pass is claimed.
- No Next build, semantic TypeScript, browser/login, Supabase/native SQL, two-service exchange, live database, deployed secret/key rotation or production gate ran. Dependencies are absent. Deployment tests were not run because deployment is outside this mission.

Before any activation: specify membership authority and retention; approve/implement visible two-sided consent UI; verify current Clerk sessions and CSRF/origin/request limits; wire private runtime config; implement durable adapter and authenticated review/withdraw; execute candidate SQL in an isolated full representative schema with concurrent transaction/RLS tests; implement reciprocal portal proof/nonce redemption and revocation/effect-boundary enforcement; validate key distribution/rotation, stale jobs/caches, logout and recovery end to end. Portal independent Q02 and production remain unmodified, and Q02 is not declared released.
