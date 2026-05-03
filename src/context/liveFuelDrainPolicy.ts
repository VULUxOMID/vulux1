import type { LiveState } from '../features/liveroom/types';

export function shouldDrainLiveFuel(liveState: LiveState, isHost: boolean): boolean {
  return liveState !== 'LIVE_CLOSED' && isHost;
}
