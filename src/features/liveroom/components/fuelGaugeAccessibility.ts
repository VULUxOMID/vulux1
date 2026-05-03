export function getFuelGaugeAccessibilityLabel(options: {
  displayLabel: string;
  isPlaceholder: boolean;
  isLow: boolean;
  isEmpty: boolean;
  isDraining: boolean;
}): string {
  if (options.isPlaceholder) {
    return 'Fuel unavailable';
  }

  const parts = [`Fuel, ${options.displayLabel} remaining`];

  if (options.isEmpty) {
    parts.push('empty');
  } else if (options.isLow) {
    parts.push('low fuel');
  }

  if (options.isDraining && !options.isEmpty) {
    parts.push('currently draining');
  }

  return parts.join(', ');
}
