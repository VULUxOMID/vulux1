module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...(config.extra ?? {}),
    clerkPublishableKey:
      process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() ||
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() ||
      '',
  },
});
