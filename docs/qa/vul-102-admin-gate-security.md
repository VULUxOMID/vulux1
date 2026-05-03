# VUL-102 admin gate security hotfix

## Decision

Real server-backed MFA was not completed in this slice.

This repo does not currently have:

- server-side MFA secret enrollment
- server-side MFA challenge verification
- recovery / rotation flow for admin MFA
- safe migration plan to avoid locking out legitimate admins

Shipping another client-generated secret flow would keep the same security problem.

## Applied fix

- removed the browser/device-stored fake TOTP gate
- removed self-enrollment QR setup
- removed local TOTP verification as a claimed security factor
- kept the real admin role check
- kept the existing admin session timeout / background lock
- replaced the challenge screen with an honest single-factor admin session unlock

## Security posture after hotfix

Admin access is currently protected by:

- the signed-in admin account and role
- the admin session timeout
- background / idle relock behavior

Admin access is **not** protected by MFA in this build.

## Verification

```bash
cd /private/tmp/vul-102-admin-gate
node --test --experimental-strip-types src/features/admin/components/adminGateMessaging.test.mjs
```

Expected:

```text
ℹ pass 4
ℹ fail 0
```

Targeted compiler scan:

```bash
cd /private/tmp/vul-102-admin-gate
npx tsc --noEmit 2>&1 | rg -n "src/features/admin/components/AdminGate\\.tsx|src/features/admin/components/AdminSessionWarningModal\\.tsx|src/features/admin/components/adminGateMessaging\\.ts|app/admin-logs\\.tsx"
```

Expected:

```text
(no matches)
```
