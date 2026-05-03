import React, { useEffect, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { getNativeRtcModule } from './platform';

type RtcMediaViewProps = {
  stream: unknown;
  mirror?: boolean;
  objectFit?: 'cover' | 'contain';
  isLocal?: boolean;
  style?: any;
};

export function RtcMediaView({
  stream,
  mirror = false,
  objectFit = 'cover',
  isLocal = false,
  style,
}: RtcMediaViewProps) {
  if (Platform.OS === 'web') {
    return (
      <RtcMediaViewWeb
        stream={stream}
        mirror={mirror}
        objectFit={objectFit}
        isLocal={isLocal}
        style={style}
      />
    );
  }

  return (
    <RtcMediaViewNative
      stream={stream}
      mirror={mirror}
      objectFit={objectFit}
      style={style}
    />
  );
}

function RtcMediaViewNative({ stream, mirror, objectFit, style }: RtcMediaViewProps) {
  const RTCView = getNativeRtcModule()?.RTCView;
  const streamUrl =
    stream && typeof stream === 'object' && 'toURL' in (stream as { toURL?: unknown })
      ? ((stream as { toURL: () => string }).toURL?.() ?? '')
      : '';

  if (!RTCView || !streamUrl) {
    return <View style={[styles.surface, style]} />;
  }

  return <RTCView streamURL={streamUrl} mirror={mirror} objectFit={objectFit} style={[styles.surface, style]} />;
}

function RtcMediaViewWeb({ stream, mirror, objectFit, isLocal, style }: RtcMediaViewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaStream = stream instanceof MediaStream ? stream : null;

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = mediaStream;
      void videoRef.current.play().catch(() => {});
    }
    if (audioRef.current) {
      audioRef.current.srcObject = mediaStream;
      void audioRef.current.play().catch(() => {});
    }
    return () => {
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      if (audioRef.current) {
        audioRef.current.srcObject = null;
      }
    };
  }, [mediaStream]);

  return (
    <>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        style={{
          width: '100%',
          height: '100%',
          objectFit,
          transform: mirror ? 'scaleX(-1)' : undefined,
          background: '#050505',
          ...style,
        }}
      />
      {!isLocal ? <audio ref={audioRef} autoPlay playsInline /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  surface: {
    width: '100%',
    height: '100%',
    backgroundColor: '#050505',
  },
});
