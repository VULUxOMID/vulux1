export type AdminGateChallengeReason = 'initial' | 'expired' | 'background' | 'locked';

export type AdminGateCopy = {
  title: string;
  subtitle: string;
  actionLabel: string;
  securityNotice: string;
};

const SHARED_SECURITY_NOTICE =
  'This admin gate currently relies on your signed-in admin account plus the local admin session timeout. Real server-backed MFA is not enabled in this build.';

export function getAdminGateCopy(reason: AdminGateChallengeReason): AdminGateCopy {
  if (reason === 'expired') {
    return {
      title: 'Admin Access',
      subtitle:
        'Your admin session expired. Continue to unlock a new admin session for this signed-in account.',
      actionLabel: 'Continue to Admin',
      securityNotice: SHARED_SECURITY_NOTICE,
    };
  }

  if (reason === 'background') {
    return {
      title: 'Admin Access',
      subtitle:
        'Admin access locks when the app leaves the foreground. Continue to unlock a new admin session for this signed-in account.',
      actionLabel: 'Continue to Admin',
      securityNotice: SHARED_SECURITY_NOTICE,
    };
  }

  if (reason === 'locked') {
    return {
      title: 'Admin Access',
      subtitle:
        'Admin access was locked. Continue to unlock a new admin session for this signed-in account.',
      actionLabel: 'Continue to Admin',
      securityNotice: SHARED_SECURITY_NOTICE,
    };
  }

  return {
    title: 'Admin Access',
    subtitle:
      'You are signed in with an admin role. Continue to unlock the admin session for this account.',
    actionLabel: 'Continue to Admin',
    securityNotice: SHARED_SECURITY_NOTICE,
  };
}
