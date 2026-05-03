import { Platform } from 'react-native';
import { getConfiguredBackendBaseUrl } from '../../../config/backendBaseUrl';

export function getRtcBackendBaseUrl(): string | null {
  const envUrl = getConfiguredBackendBaseUrl();
  if (envUrl) {
    return envUrl.replace(/\/+$/, '');
  }

  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, '');
  }

  return null;
}

export function isRtcEnabled(): boolean {
  const raw = process.env.EXPO_PUBLIC_RTC_ENABLE?.trim();
  if (!raw) {
    return true;
  }
  return !['0', 'false', 'no', 'off'].includes(raw.toLowerCase());
}

export function isRtcQaForceEnabled(): boolean {
  const raw = process.env.EXPO_PUBLIC_QA_FORCE_RTC?.trim();
  if (!raw) {
    return false;
  }
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

export function isRtcDebugOverlayEnabled(): boolean {
  const raw = process.env.EXPO_PUBLIC_RTC_DEBUG_OVERLAY?.trim();
  if (!raw) {
    return __DEV__;
  }
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}
