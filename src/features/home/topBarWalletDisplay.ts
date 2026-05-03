type TopBarWalletChipStateInput = {
  cash: number;
  fuel: number;
  showAuthoritativeWallet: boolean;
};

type TopBarWalletChipState = {
  cashLabel: string;
  fuelLabelOverride?: string;
};

function formatCash(amount: number): string {
  const normalized = Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0;
  if (normalized >= 1000) {
    return `${(normalized / 1000).toFixed(1)}k`;
  }
  return normalized.toString();
}

function formatFuelFallback(amount: number): string {
  const normalized = Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0;
  return `${normalized}s`;
}

export function getTopBarWalletChipState(
  input: TopBarWalletChipStateInput,
): TopBarWalletChipState {
  if (input.showAuthoritativeWallet) {
    return {
      cashLabel: formatCash(input.cash),
    };
  }

  return {
    cashLabel: formatCash(input.cash),
    fuelLabelOverride: formatFuelFallback(input.fuel),
  };
}
