export function shouldPersistProfileView(params: {
  viewerUserId: string | null | undefined;
  profileUserId: string | null | undefined;
  isSelfPreview?: boolean;
}): boolean {
  const viewerUserId = params.viewerUserId?.trim();
  const profileUserId = params.profileUserId?.trim();
  if (!viewerUserId || !profileUserId) {
    return false;
  }
  if (params.isSelfPreview) {
    return false;
  }
  return viewerUserId !== profileUserId;
}
