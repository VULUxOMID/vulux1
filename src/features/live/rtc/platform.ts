import { Platform } from 'react-native';
import { isRtcQaForceEnabled } from './config';

type NativeRtcModule = typeof import('react-native-webrtc');

let nativeRtcModule: NativeRtcModule | null | undefined;

export function getNativeRtcModule(): NativeRtcModule | null {
  if (Platform.OS === 'web') {
    return null;
  }

  if (nativeRtcModule !== undefined) {
    return nativeRtcModule;
  }

  try {
    nativeRtcModule = require('react-native-webrtc') as NativeRtcModule;
  } catch (error) {
    nativeRtcModule = null;
    if (__DEV__) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn('[rtc] react-native-webrtc unavailable; disabling native RTC runtime.', {
        message,
      });
    }
  }

  return nativeRtcModule;
}

export function getMediaDevices(): any | null {
  if (Platform.OS === 'web') {
    return typeof navigator !== 'undefined' ? navigator.mediaDevices : null;
  }
  return getNativeRtcModule()?.mediaDevices ?? null;
}

export function getRTCPeerConnectionImpl(): any {
  return Platform.OS === 'web' ? globalThis.RTCPeerConnection : getNativeRtcModule()?.RTCPeerConnection;
}

export function getRTCIceCandidateImpl(): any {
  return Platform.OS === 'web' ? globalThis.RTCIceCandidate : getNativeRtcModule()?.RTCIceCandidate;
}

export function getRTCSessionDescriptionImpl(): any {
  return Platform.OS === 'web'
    ? globalThis.RTCSessionDescription
    : getNativeRtcModule()?.RTCSessionDescription;
}

export function isRtcSupported(): boolean {
  if (Platform.OS === 'web') {
    if (isRtcQaForceEnabled()) {
      return typeof window !== 'undefined' && typeof globalThis.RTCPeerConnection !== 'undefined';
    }
    return (
      typeof window !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      Boolean(navigator.mediaDevices?.getUserMedia) &&
      typeof globalThis.RTCPeerConnection !== 'undefined'
    );
  }

  const nativeModule = getNativeRtcModule();
  return Boolean(nativeModule?.mediaDevices?.getUserMedia && nativeModule?.RTCPeerConnection);
}

export function createEmptyMediaStream(): any {
  if (Platform.OS === 'web') {
    return new MediaStream();
  }
  const nativeModule = getNativeRtcModule();
  return nativeModule ? new nativeModule.MediaStream() : null;
}
