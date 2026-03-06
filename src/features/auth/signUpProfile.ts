export type SignUpProfileParts = {
  username: string;
  displayName: string;
  firstName: string;
  lastName?: string;
};

const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 30;
const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9._]{1,28}[a-z0-9])?$/;

export function normalizeRequestedUsername(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '_');
}

export function buildSignUpProfileParts(args: {
  username: string;
  displayName: string;
}): SignUpProfileParts | { error: string } {
  const username = normalizeRequestedUsername(args.username);
  if (!username) {
    return { error: 'Pick a username to create your account.' };
  }
  if (username.length < USERNAME_MIN_LENGTH) {
    return { error: `Use a username with at least ${USERNAME_MIN_LENGTH} characters.` };
  }
  if (username.length > USERNAME_MAX_LENGTH) {
    return { error: `Use a username with ${USERNAME_MAX_LENGTH} characters or fewer.` };
  }
  if (!USERNAME_PATTERN.test(username)) {
    return {
      error:
        'Usernames can use lowercase letters, numbers, periods, and underscores only.',
    };
  }

  const displayName = args.displayName.trim().replace(/\s+/g, ' ');
  if (!displayName) {
    return { error: 'Pick a display name to create your account.' };
  }

  const [firstName, ...rest] = displayName.split(' ');
  return {
    username,
    displayName,
    firstName,
    lastName: rest.length > 0 ? rest.join(' ') : undefined,
  };
}
