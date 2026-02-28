import { useEffect, useMemo, useState } from 'react';

import {
  getSpacetimeTelemetrySnapshot,
  subscribeSpacetimeTelemetry,
  type SpacetimeTelemetrySnapshot,
} from '../../../lib/spacetime';

function getFreshnessLabel(timestamp: number | null): string {
  if (!timestamp) {
    return 'No signal yet';
  }

  const ageMs = Math.max(0, Date.now() - timestamp);
  if (ageMs < 1_000) {
    return 'Updated just now';
  }

  return `Updated ${Math.floor(ageMs / 1_000)}s ago`;
}

export function useAdminTelemetry() {
  const [snapshot, setSnapshot] = useState<SpacetimeTelemetrySnapshot>(() =>
    getSpacetimeTelemetrySnapshot(),
  );

  useEffect(() => subscribeSpacetimeTelemetry(setSnapshot), []);

  return useMemo(() => {
    const isConnected =
      snapshot.connectionState === 'connected' && snapshot.subscriptionState === 'active';

    const statusLabel = `${snapshot.connectionState}/${snapshot.subscriptionState}`;

    return {
      dataFreshnessLabel: getFreshnessLabel(snapshot.lastDataChangeAt),
      isConnected,
      snapshot,
      statusLabel,
      updatedLabel: getFreshnessLabel(snapshot.updatedAt),
    };
  }, [snapshot]);
}
