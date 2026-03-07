export const LIVE_EMPTY_STATE = {
  title: 'No live rooms right now',
  description:
    'Nobody is live on Home at the moment. Start your own room to show up here first, or check back soon.',
  ctaLabel: 'Go Live',
} as const;

export function shouldShowLiveEmptyState({
  loading,
  livesCount,
}: {
  loading: boolean;
  livesCount: number;
}): boolean {
  return !loading && livesCount === 0;
}
