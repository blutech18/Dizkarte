# Decision Register

Conservative implementation defaults pending written Client approval. These are
not assertions of business policy. Each item lists the default in code and the
owner/decision required.

| #   | Topic                       | Conservative default in code                           | Decision required                | Owner  | Status |
| --- | --------------------------- | ------------------------------------------------------ | -------------------------------- | ------ | ------ |
| D1  | Auth method                 | Email/password only; social login hidden               | Confirm baseline                 | Client | Open   |
| D2  | Identity KYC                | Manual Admin review; no automated-KYC claim            | Approve accepted IDs/eligibility | Client | Open   |
| D3  | Platform fee                | `platform_fee_bps = 0` (configurable)                  | Approve fee model/rate           | Client | Open   |
| D4  | Optional client fee         | Disabled (`optional_client_fee_enabled = false`)       | Approve if any                   | Client | Open   |
| D5  | Release model               | Client-confirmed only; `auto_release_enabled = false`  | Approve auto/manual release      | Client | Open   |
| D6  | Currency                    | PHP, integer centavos                                  | Confirm                          | Client | Open   |
| D7  | Public location precision   | 3 decimal places (`public_pin_decimal_places`)         | Approve pin precision/radius     | Client | Open   |
| D8  | Dual-role switching         | Not exposed in UX                                      | Approve if allowed               | Client | Open   |
| D9  | Review reveal               | Reveal when both submitted; no auto-expiry             | Approve review window/formula    | Client | Open   |
| D10 | Payment provider            | None hard-coded; synthetic in dev, fail-closed in prod | Select lawful provider/model     | Client | Open   |
| D11 | Media limits                | Technical safeguards only (see `@dizkarte/config`)     | Approve final media policy       | Client | Open   |
| D12 | Admin capability split      | `ADMIN_SUPPORT / ADMIN_FINANCE / ADMIN_SUPER`          | Approve MFA/dual-control matrix  | Client | Open   |
| D13 | Cancellation/refund/dispute | State transitions exist; formulas disabled             | Approve policies                 | Client | Open   |
| D14 | PSGC locality source        | Placeholder codes in dev                               | Approve source/version           | Client | Open   |

Update this register whenever a default changes or a decision is made, together
with the code tokens, tests, and docs it affects.
