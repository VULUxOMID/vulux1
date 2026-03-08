import assert from 'node:assert/strict';
import test from 'node:test';

import { getAdminGateCopy } from './adminGateMessaging.ts';

const BANNED_SECURITY_TERMS = ['totp', '2fa', 'authenticator', 'one-time code', 'second factor'];

for (const reason of ['initial', 'expired', 'background', 'locked']) {
  test(`admin gate copy for ${reason} is honest single-factor copy`, () => {
    const copy = getAdminGateCopy(reason);
    const combined = `${copy.title} ${copy.subtitle} ${copy.actionLabel} ${copy.securityNotice}`.toLowerCase();

    assert.equal(copy.title, 'Admin Access');
    assert.equal(copy.actionLabel, 'Continue to Admin');
    assert.match(copy.securityNotice, /signed-in admin account/i);
    assert.match(copy.securityNotice, /server-backed mfa is not enabled/i);

    for (const term of BANNED_SECURITY_TERMS) {
      assert.equal(combined.includes(term), false, `unexpected legacy MFA term present: ${term}`);
    }
  });
}
