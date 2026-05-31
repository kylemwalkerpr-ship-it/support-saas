# Support RBAC Matrix

Source of truth: `lib/rbac.ts`. Update both files together.

Legend:

- ✅ — always permitted for this role.
- ❌ — always denied.
- 🟡 — conditionally permitted; see the condition column.

Roles considered: `client`, `consultant`, `support`, `admin`. `client` and
`consultant` are denied every support-surface action, so the table only
breaks out the two operator roles.

Threshold constants (from `lib/constants.ts`):

- `SUPPORT_REFUND_CAP_CENTS = 50_000` ($500)
- `SUPPORT_WALLET_CREDIT_CAP_CENTS = 20_000` ($200)

| Action                              | client | consultant | support | admin | Condition (for 🟡)                                                                                          |
| ----------------------------------- | :----: | :--------: | :-----: | :---: | ----------------------------------------------------------------------------------------------------------- |
| user.search                         |   ❌   |     ❌     |   ✅    |  ✅   |                                                                                                             |
| user.read                           |   ❌   |     ❌     |   ✅    |  ✅   |                                                                                                             |
| user.suspend                        |   ❌   |     ❌     |   🟡    |  ✅   | support: only if target role is `client` or `consultant` (not `support` / `admin`)                          |
| user.reactivate                     |   ❌   |     ❌     |   🟡    |  ✅   | support: only if target role is `client` or `consultant`                                                    |
| user.change_role                    |   ❌   |     ❌     |   ❌    |  ✅   |                                                                                                             |
| user.add_note                       |   ❌   |     ❌     |   ✅    |  ✅   |                                                                                                             |
| order.search                        |   ❌   |     ❌     |   ✅    |  ✅   |                                                                                                             |
| order.read                          |   ❌   |     ❌     |   ✅    |  ✅   |                                                                                                             |
| order.extend_deadline               |   ❌   |     ❌     |   ✅    |  ✅   |                                                                                                             |
| order.force_cancel                  |   ❌   |     ❌     |   ✅    |  ✅   |                                                                                                             |
| order.send_message                  |   ❌   |     ❌     |   ✅    |  ✅   |                                                                                                             |
| order.refund                        |   ❌   |     ❌     |   🟡    |  ✅   | support: `amountCents <= SUPPORT_REFUND_CAP_CENTS`; otherwise `requires_admin_co_sign` (402)                |
| dispute.search                      |   ❌   |     ❌     |   ✅    |  ✅   |                                                                                                             |
| dispute.read                        |   ❌   |     ❌     |   ✅    |  ✅   |                                                                                                             |
| dispute.open                        |   ❌   |     ❌     |   ✅    |  ✅   |                                                                                                             |
| dispute.decide                      |   ❌   |     ❌     |   🟡    |  ✅   | support: may call; if the refund portion exceeds the cap the action converts to a co-sign proposal          |
| dispute.cosign                      |   ❌   |     ❌     |   ❌    |  ✅   |                                                                                                             |
| escrow.release                      |   ❌   |     ❌     |   ✅    |  ✅   | executed via portal service token; same cap enforcement runs on the portal side                            |
| inbox.search                        |   ❌   |     ❌     |   ✅    |  ✅   |                                                                                                             |
| inbox.read                          |   ❌   |     ❌     |   ✅    |  ✅   |                                                                                                             |
| inbox.take                          |   ❌   |     ❌     |   ✅    |  ✅   |                                                                                                             |
| inbox.release                       |   ❌   |     ❌     |   ✅    |  ✅   |                                                                                                             |
| inbox.assign                        |   ❌   |     ❌     |   ✅    |  ✅   |                                                                                                             |
| inbox.set_status                    |   ❌   |     ❌     |   ✅    |  ✅   |                                                                                                             |
| inbox.send_message                  |   ❌   |     ❌     |   ✅    |  ✅   |                                                                                                             |
| macro.list                          |   ❌   |     ❌     |   ✅    |  ✅   |                                                                                                             |
| macro.read                          |   ❌   |     ❌     |   ✅    |  ✅   |                                                                                                             |
| macro.create_personal               |   ❌   |     ❌     |   ✅    |  ✅   |                                                                                                             |
| macro.create_team_wide              |   ❌   |     ❌     |   ❌    |  ✅   |                                                                                                             |
| macro.update_personal               |   ❌   |     ❌     |   🟡    |  ✅   | support: only if `ownerId === actorId` (own macro only)                                                     |
| macro.update_team_wide              |   ❌   |     ❌     |   ❌    |  ✅   |                                                                                                             |
| macro.delete_personal               |   ❌   |     ❌     |   🟡    |  ✅   | support: only if `ownerId === actorId`                                                                      |
| macro.delete_team_wide              |   ❌   |     ❌     |   ❌    |  ✅   |                                                                                                             |
| verification.search                 |   ❌   |     ❌     |   ✅    |  ✅   |                                                                                                             |
| verification.read                   |   ❌   |     ❌     |   ✅    |  ✅   |                                                                                                             |
| verification.approve                |   ❌   |     ❌     |   ✅    |  ✅   |                                                                                                             |
| verification.request_changes        |   ❌   |     ❌     |   ✅    |  ✅   |                                                                                                             |
| verification.reject                 |   ❌   |     ❌     |   ✅    |  ✅   |                                                                                                             |
| verification.bulk_assign            |   ❌   |     ❌     |   ✅    |  ✅   |                                                                                                             |
| moderation.search                   |   ❌   |     ❌     |   ✅    |  ✅   |                                                                                                             |
| moderation.read                     |   ❌   |     ❌     |   ✅    |  ✅   |                                                                                                             |
| moderation.dismiss                  |   ❌   |     ❌     |   ✅    |  ✅   |                                                                                                             |
| moderation.hide                     |   ❌   |     ❌     |   ✅    |  ✅   |                                                                                                             |
| moderation.warn                     |   ❌   |     ❌     |   ✅    |  ✅   |                                                                                                             |
| moderation.suspend                  |   ❌   |     ❌     |   ✅    |  ✅   | underlying user.suspend still enforces the support/admin target guard                                       |
| moderation.create_system_flag       |   ❌   |     ❌     |   ❌    |  ✅   |                                                                                                             |
| wallet.credit                       |   ❌   |     ❌     |   🟡    |  ✅   | support: `amountCents <= SUPPORT_WALLET_CREDIT_CAP_CENTS`; otherwise `requires_admin_co_sign` (402)         |
| email.send_to_user                  |   ❌   |     ❌     |   ✅    |  ✅   |                                                                                                             |
| audit.search                        |   ❌   |     ❌     |   ✅    |  ✅   |                                                                                                             |
| audit.export                        |   ❌   |     ❌     |   ❌    |  ✅   |                                                                                                             |
| metrics.read_mine                   |   ❌   |     ❌     |   ✅    |  ✅   |                                                                                                             |
| metrics.read_team                   |   ❌   |     ❌     |   ❌    |  ✅   |                                                                                                             |
| notification.read                   |   ❌   |     ❌     |   ✅    |  ✅   |                                                                                                             |
| notification.mark_read              |   ❌   |     ❌     |   ✅    |  ✅   |                                                                                                             |

## Notes

- The matrix is enforced by `can(role, action, ctx)` in `lib/rbac.ts`.
  Mutating server actions use `requireCan(profile, action, ctx)` which
  throws `SupportActionError('forbidden', ..., 403)` on denial.
- Two actions intentionally preserve a domain-specific error code
  instead of `forbidden`:
  - `order.refund` → `requires_admin_co_sign` (HTTP 402) when
    `amountCents > SUPPORT_REFUND_CAP_CENTS`.
  - `wallet.credit` → `requires_admin_co_sign` (HTTP 402) when
    `amountCents > SUPPORT_WALLET_CREDIT_CAP_CENTS`.
  These are policy outcomes, not authorisation failures — the UI
  surfaces them as "this requires admin approval" rather than a
  flat 403.
- `dispute.decide` may convert a would-be unilateral large refund
  into a co-sign proposal (status `triage`) rather than refusing.
  `dispute.cosign` is the admin's approval gate.
