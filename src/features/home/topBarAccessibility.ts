export function getHomeCashPillAccessibilityLabel(options: {
  cashLabel: string;
  hasAuthoritativeWallet: boolean;
}): string {
  if (!options.hasAuthoritativeWallet) {
    return 'Cash balance unavailable';
  }

  return `Cash balance, ${options.cashLabel}`;
}
