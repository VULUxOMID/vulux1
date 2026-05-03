export function getProfileViewsPillAccessibilityLabel(
  totalViews: number,
  unreadProfileViewCount: number,
): string {
  const safeTotalViews = Math.max(0, Math.floor(totalViews));
  const safeUnreadCount = Math.max(0, Math.floor(unreadProfileViewCount));

  if (safeUnreadCount > 0) {
    return `Profile views, ${safeTotalViews} total views, ${safeUnreadCount} unread profile view notifications`;
  }

  return `Profile views, ${safeTotalViews} total views`;
}
