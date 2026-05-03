export function getLiveViewerCountAccessibilityLabel(viewerCount: number): string {
  if (viewerCount === 1) {
    return '1 viewer in the live';
  }

  return `${viewerCount} viewers in the live`;
}

export function getLiveProfileViewsAccessibilityLabel(profileViewCount: number): string {
  if (profileViewCount === 1) {
    return '1 profile view in this live';
  }

  return `${profileViewCount} profile views in this live`;
}
