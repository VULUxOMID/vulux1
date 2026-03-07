# VUL-94 withdrawal eligibility guardrails

## Before

- Wallet card always rendered an active `Request Withdrawal` button.
- CTA could be tapped even when payout availability was `$0.00`.
- CTA did not wait for a server-authoritative wallet state before enabling.

## After

- `Request Withdrawal` stays disabled until:
  - `walletHydrated === true`
  - `walletStateAvailable === true`
  - payout-eligible Gems meet the configured minimum
- Wallet card explains why payout is unavailable:
  - wallet still syncing
  - zero payout-eligible Gems
  - below minimum withdrawal threshold
- Withdrawal modal also honors the same eligibility state if it is already open during a wallet refresh.

## Verification

```bash
cd /private/tmp/vul-94-withdrawal-guardrails
node --test --experimental-strip-types src/features/shop/withdrawalEligibility.test.mjs
```

Result:

```text
ℹ pass 4
ℹ fail 0
```

Targeted TypeScript scan on touched files:

```bash
cd /private/tmp/vul-94-withdrawal-guardrails
npx tsc --noEmit 2>&1 | rg -n "app/\\(tabs\\)/shop\\.tsx|src/features/shop/ShopWalletTab\\.tsx|src/features/shop/WithdrawalModal\\.tsx|src/features/shop/withdrawalEligibility\\.ts"
```

Result:

```text
(no matches)
```
