export function formatTimeAgo(timestamp: number | Date): string {
  const now = Date.now();
  const time = typeof timestamp === 'number' ? timestamp : timestamp.getTime();
  const diffMs = now - time;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) {
    return 'just now';
  } else if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else {
    const date = new Date(time);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}
