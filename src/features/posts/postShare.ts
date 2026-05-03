import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { Platform, Share } from 'react-native';

function buildWebPostUrl(postId: string) {
  if (typeof window === 'undefined') {
    return `/posts/${postId}`;
  }
  return new URL(`/posts/${postId}`, window.location.origin).toString();
}

export function buildPostShareUrl(postId: string) {
  if (Platform.OS === 'web') {
    return buildWebPostUrl(postId);
  }
  return Linking.createURL(`/posts/${postId}`);
}

export async function sharePostLink(postId: string) {
  const url = buildPostShareUrl(postId);

  if (Platform.OS === 'web') {
    await Clipboard.setStringAsync(url);
    return { url, mode: 'copied' as const };
  }

  try {
    await Share.share({ message: url, url });
    return { url, mode: 'shared' as const };
  } catch {
    await Clipboard.setStringAsync(url);
    return { url, mode: 'copied' as const };
  }
}
