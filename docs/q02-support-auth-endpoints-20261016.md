# Q02 support authenticated consent endpoints — 16 October 2026

Bounded S2 source candidate only. **Disabled, not shipped, not Q02 release.** Account routes are intentionally denied in the supplied runtime because the authoritative membership contract is missing. No account linking, transcript deletion, or derived-memory suppression is enabled.

## Fence and source evidence

Only worktree `/Users/phantomdarne/.openhands-platform/yqaa-canonical/worktrees/yqaa-yqaa-q02-support-auth-endpoints-20261016-s2`, branch `feat/yqaa-q02-support-auth-endpoints-20261016`, HEAD/base `45c143d617e1131224bab70f38de7ea8c50eac6b`. Supplied lease nonce `1a17d1261588874b64e21b2cae2dc873` was not independently validated or mutated. Edits are new files under app/, lib/, supabase/, tests/, docs/. Existing tracked source and the five inherited S1 files were not edited. Original support checkout, S1 checkout, portal, orchestrator and signed receipts were not touched.

Read-only inspection found:

- `lib/clerk-session.mjs` verifies Clerk tokens using the actual verifier and requires immutable `sub` and `sid`; `lib/auth.ts` only exports subject/email helpers. S2 does not change those paths.
- `lib/actions/profiles.ts` uses direct `clerk_user_id` lookup but also staff email relinking. Neither shared profile roles nor relinked email establishes canonical support tenant/site membership. No authoritative membership schema was found in the supplied migrations. No binding was invented.
- `lib/supabase/server.ts` provides a server-only service-role client. S1 forbids direct privacy table grants; S2 adds only a candidate narrowly scoped read RPC.
- Widget routes use per-conversation `X-Chat-Token` and explicit YouSafe-origin CORS. This remains separate from Clerk account authority. Existing account routes do not establish a reusable strict CSRF convention; S2 supplies its own static exact-origin checks.
- Installed `node_modules/next/dist/docs/` is absent. No new Next API was inferred: thin route files follow existing Request/Response, method exports and Promise params conventions. Framework compilation/integration remains unverified pending exact-lock dependencies and the required local Next guides.

No network, installation, live secrets/auth, DB connection/migration application, external model/Jev call, new worker, server restart, commit, push, PR, deployment or merge occurred. The task's explicit no-network/no-external-model instruction overrides the general Jev routing/gate convention. This is the existing supervised session; no CLI worker was launched.

## Routes and denial behavior

`app/api/privacy/account/[action]/route.ts` delegates to the dependency-free tested `handleAccountPrivacy` using server-only `lib/privacy/runtime.ts`:

| Method/path suffix under `/api/privacy/account/` | Contract after authority provisioning |
| --- | --- |
| GET `review` | Current subject's state/scopes/disclosure, availability; no raw subject/site/tenant/epoch |
| POST `grant` | Exact `{accepted:true,disclosure:"q02-support-v1",scopes:[...]}`; nonempty unique sorted subset of `derived_summary`, `preferences` |
| POST `issue` | Same explicit opt-in fields plus `nonce`; current persisted active scopes must match exactly; durable reserve before ES256 signature |
| POST `withdraw` | Exact `{}`; server reads epoch then CAS withdraws; independent of issuance kill switch |
| GET `forget` | Retention/status, explicitly unavailable deletion |
| POST `forget` | Exact `{}`; 409, no records deleted or suppression claimed |
| POST `redeem` | Always denied; no consume RPC or linking path exposed |

Actual supplied runtime returns 403 for every supported account operation until membership is independently implemented, even for an otherwise valid Clerk session. No environment flag can enable the absent membership/store wiring. This also means account withdrawal is **not operational yet**; do not activate any consent issuance before withdrawal authority is operational. The issuance switch itself does not block withdrawal in the handler (tested).

All POSTs require static exact `https://support.yousafeconsultancy.com` Origin, reject foreign/null/missing Origin and cross-site/same-site Sec-Fetch-Site, require JSON content type, limit actual streamed body to 2048 bytes, reject extra body fields and derive no identity/epoch from JSON. No Host or forwarded-host trust. Responses are private/no-store with uniform 403 authorization/error bodies, no exception details. Unsupported method/action pairs return 405 with the same error text. Same-origin browser credentials remain required; no cross-origin account CORS is granted. Limits bound bytes, not request duration/rate: infrastructure timeout/rate quotas remain an activation gate.

S2 session adapter reads only the established `__session` cookie and invokes existing Clerk verification using a runtime public `CLERK_JWT_KEY`, explicitly pinned `Q02_SUPPORT_CLERK_ISSUER`, exact support authorized party/azp and zero clock skew. It has no secret-key/JWKS network fallback. It returns verified sub/sid/exp only; missing/expired verification fails closed. No keys were read during this task. Full verifier integration, session revocation/logout freshness and deployment-specific Clerk issuer/azp configuration need exact-lock integration tests before activation. A valid JWT from a shared Clerk instance alone never grants support membership.

## Missing authority adapter and private signing contract

`account-api.d.mts` defines session, membership, consent and store interfaces. A future reviewed membership adapter MUST perform a current authoritative DB lookup keyed by verified immutable support subject and current session, constrained to fixed deployment site/tenant. It must reject absent, suspended, ambiguous, foreign-site/tenant membership and errors. It must have separately specified withdrawal eligibility so disabling new linking or changing membership does not strand existing lawful withdrawal. No request-derived identifiers, shared app identity alone, role shortcut, email match, visitor token or profile mutations. Define approved schema/ownership first; returning null is intentional, not a placeholder permission grant.

After that review, runtime store construction may use `createPrivacyStore(createSupabaseAdminClient(), verifiedContext)` from `service-store.mjs`. It only invokes service-role `support_privacy_review`/S1 `support_privacy_transition` RPCs with fixed server-derived subject/site/tenant. Grant/withdraw use a server-read epoch and CAS; concurrent changes deny, with no automatic retry/regrant. Reserve binds all claims to that context, exact epoch/scopes, nonce/JTI and timestamp conversion. Errors never fall back to memory. There is no public consume capability. Candidate migration 015 adds a read-only SECURITY DEFINER JSON RPC with fixed search_path, service_role-only execution, no identifiers returned and no row creation; absent row reports withdrawn epoch 0. S1 migration/RLS is unchanged. SQL has source-invariant tests only in this attempt; native isolated execution/privilege checks for 015 remain required.

Private signing is S1's unchanged strict `issueIntent`, now called only through validated S2 handler state and durable store reservation. A future trusted server config must supply literal enabled, distinct static HTTPS issuer/audience, canonical site/tenant, kid and a distinct runtime ES256 P-256 private JWK. Request bodies cannot provide key/config. The production runtime currently supplies only disabled configuration and never loads a signing key. No key logging/export endpoint, public discovery, hardcoded private key or production key read exists. Ephemeral tests generate their own keys. Failed signing after reservation burns the nonce/JTI; do not retry or restore it.

Reciprocal portal assertion verification is absent: no pinned portal public-key trust, approved reciprocal schema or authoritative online portal epoch service exists. Redemption remains denied regardless of support proof validity, and neither proof alone establishes linking. Portal must independently verify its own current session and granular consent, persist a session-bound single-use challenge, and sign an assertion binding both sites/tenants/subjects, support proof digest/JTI, nonce, exact scopes/purpose, both current consent epochs and short validity/replay identifiers. The exact reciprocal protocol still requires joint approval; this prose is a requirements contract, not an interoperable schema. Never accept requester keys/unsigned identities or consume before both proofs and current epochs are verified atomically. See the inherited S1 document for exact support JWS schema, tombstones/outbox and effect-boundary requirements.

## Visitor review

GET `/api/chat/widget/[id]/privacy` requires the existing per-conversation `X-Chat-Token`. It selects only `visitor_token_hash` for that UUID and uses existing hash/constant-time helpers; no transcript, raw IDs, hash or account identity is returned. Missing/malformed/wrong token, unknown/legacy conversation or DB failure yields the same 404 JSON. Clerk cookies cannot substitute. OPTIONS retains existing restricted widget CORS and header conventions. This GET does not mutate conversation state and returns unavailable linking/forget plus explicit retention limitations. No visitor deletion route was added. Existing widget authorization, staff access, replies, AI context selection and profile privileges were not edited.

## Offline verification

Node v22.22.2. Exact commands:

```sh
node --test tests/q02-support-auth-endpoints.test.mjs
node --test tests/q02-support-auth-endpoints.test.mjs tests/q02-support-privacy.test.mjs tests/widget-auth.test.mjs tests/support-profile-policy.test.mjs tests/edge-guard.test.mjs tests/support-known-routes.test.mjs tests/auth-links-market-modal.test.mjs tests/language-picker-layout.test.mjs tests/ai-discoverability-contract.test.mjs
node --test tests/clerk-session.test.mjs
git diff --check
```

Initial new suite: 22/22 passed. Final suite after additional forgery/JTI/SQL checks: 25 tests; combined command **90 passed, 0 failed, 0 skipped**. It includes real ephemeral ES256 signature verification through the actual S2 handler/service adapter, persisted-reservation mock nonce/JTI rejection, expiry/session/membership/CSRF/body limits, exact granular consent, disabled issuance with withdrawal preserved, retention refusal and visitor/account boundary. DB RPC responses and membership are synthetic; these tests do not establish real DB or Clerk integration. S1 existing tests additionally cover strict claims, forgery, expiry, stale epochs, concurrency simulations and late effects.

Existing Clerk test command exits 1 loading missing `@clerk/backend` (`ERR_MODULE_NOT_FOUND`); no integration pass and no full-suite-green claim. `git diff --check` exits 0 (tracked diff is empty; new-file whitespace checked separately). No Next/TypeScript build, browser/Jest, native PostgreSQL, Supabase or live authentication test ran. Supervisor reports S1's separate native 30/30 PostgreSQL checks; those were not rerun here and do not validate new migration 015. No production verification occurred.

Before release: real membership/withdrawal authority and full representative schema; approved visible two-sided consent UI and disclosure; runtime key/trust provisioning and rotation; reciprocal portal counterpart and current-epoch exchange; durable downstream suppression/retention/legal policies and outbox handling; isolated native SQL 015/RLS/concurrency checks; exact-lock framework/Clerk integration and live browser/logout verification; abuse/resource limits; coordinated reviewed deployment. The unrelated P0 reply-generation bug remains a separate post-Q02 investigation.
