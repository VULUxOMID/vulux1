import React from 'react';
import { Platform, StyleSheet } from 'react-native';

type AnyRecord = Record<string, unknown>;

const INSTALL_KEY = '__vuluRnWebDeprecationCompatInstalled__';

function isPlainObject(value: unknown): value is AnyRecord {
  if (!value || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function applyOpacityToColor(color: string, opacity: number): string {
  if (opacity >= 1 || !Number.isFinite(opacity)) return color;
  const normalized = color.trim();
  if (!normalized.startsWith('#')) return color;
  const hex = normalized.slice(1);
  if (hex.length === 3) {
    const r = Number.parseInt(hex[0] + hex[0], 16);
    const g = Number.parseInt(hex[1] + hex[1], 16);
    const b = Number.parseInt(hex[2] + hex[2], 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }
  if (hex.length === 6) {
    const r = Number.parseInt(hex.slice(0, 2), 16);
    const g = Number.parseInt(hex.slice(2, 4), 16);
    const b = Number.parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }
  return color;
}

function normalizeShadowStyle(style: AnyRecord): AnyRecord {
  const next = { ...style };
  const shadowColor = typeof next.shadowColor === 'string' ? next.shadowColor : undefined;
  const shadowOpacity = typeof next.shadowOpacity === 'number' ? next.shadowOpacity : 1;
  const shadowRadius = typeof next.shadowRadius === 'number' ? next.shadowRadius : 0;
  const shadowOffset = isPlainObject(next.shadowOffset) ? next.shadowOffset : null;
  const shadowX = typeof shadowOffset?.width === 'number' ? shadowOffset.width : 0;
  const shadowY = typeof shadowOffset?.height === 'number' ? shadowOffset.height : 0;

  const hasLegacyShadowKeys =
    'shadowColor' in next ||
    'shadowOpacity' in next ||
    'shadowRadius' in next ||
    'shadowOffset' in next;

  if (hasLegacyShadowKeys && typeof next.boxShadow !== 'string') {
    const color = shadowColor ? applyOpacityToColor(shadowColor, shadowOpacity) : `rgba(0, 0, 0, ${shadowOpacity})`;
    next.boxShadow = `${shadowX}px ${shadowY}px ${shadowRadius}px ${color}`;
  }

  delete next.shadowColor;
  delete next.shadowOpacity;
  delete next.shadowRadius;
  delete next.shadowOffset;
  return next;
}

function normalizeTextShadowStyle(style: AnyRecord): AnyRecord {
  const next = { ...style };
  const textShadowColor = typeof next.textShadowColor === 'string' ? next.textShadowColor : undefined;
  const textShadowRadius = typeof next.textShadowRadius === 'number' ? next.textShadowRadius : 0;
  const textShadowOffset = isPlainObject(next.textShadowOffset) ? next.textShadowOffset : null;
  const textShadowX = typeof textShadowOffset?.width === 'number' ? textShadowOffset.width : 0;
  const textShadowY = typeof textShadowOffset?.height === 'number' ? textShadowOffset.height : 0;

  const hasLegacyTextShadowKeys =
    'textShadowColor' in next ||
    'textShadowRadius' in next ||
    'textShadowOffset' in next;

  if (hasLegacyTextShadowKeys && typeof next.textShadow !== 'string') {
    next.textShadow = `${textShadowX}px ${textShadowY}px ${textShadowRadius}px ${textShadowColor ?? 'transparent'}`;
  }

  delete next.textShadowColor;
  delete next.textShadowRadius;
  delete next.textShadowOffset;
  return next;
}

function normalizeStyleObject(style: AnyRecord): AnyRecord {
  let next = style;
  next = normalizeShadowStyle(next);
  next = normalizeTextShadowStyle(next);
  return next;
}

function normalizeStyleProp(style: unknown): unknown {
  if (Array.isArray(style)) {
    return style.map((entry) => normalizeStyleProp(entry));
  }

  if (!isPlainObject(style)) {
    return style;
  }

  return normalizeStyleObject(style);
}

function installCompatPatches() {
  if (Platform.OS !== 'web') return;
  const globalRecord = globalThis as AnyRecord;
  if (globalRecord[INSTALL_KEY]) return;

  const styleSheetAny = StyleSheet as unknown as { create: (styles: AnyRecord) => AnyRecord };
  const originalCreate = styleSheetAny.create.bind(StyleSheet);
  styleSheetAny.create = ((styles: AnyRecord) => {
    if (!isPlainObject(styles)) {
      return originalCreate(styles);
    }
    const normalizedStyles: AnyRecord = {};
    for (const [key, value] of Object.entries(styles)) {
      normalizedStyles[key] = isPlainObject(value) ? normalizeStyleObject(value) : value;
    }
    return originalCreate(normalizedStyles);
  }) as typeof styleSheetAny.create;

  const reactAny = React as unknown as {
    createElement: (type: unknown, props: AnyRecord | null | undefined, ...children: unknown[]) => unknown;
  };
  const originalCreateElement = reactAny.createElement.bind(React);
  reactAny.createElement = ((type: unknown, props: AnyRecord | null | undefined, ...children: unknown[]) => {
    if (!props || typeof props !== 'object') {
      return originalCreateElement(type, props, ...children);
    }

    let nextProps: AnyRecord = props;
    if ('pointerEvents' in nextProps) {
      const pointerEvents = nextProps.pointerEvents;
      const existingStyle = nextProps.style;
      const pointerStyle = pointerEvents ? { pointerEvents } : null;
      const mergedStyle = Array.isArray(existingStyle)
        ? [...existingStyle, pointerStyle]
        : [existingStyle, pointerStyle];
      const { pointerEvents: _ignored, ...rest } = nextProps;
      nextProps = { ...rest, style: mergedStyle };
    }

    if ('style' in nextProps) {
      const normalizedStyle = normalizeStyleProp(nextProps.style);
      if (normalizedStyle !== nextProps.style) {
        nextProps = { ...nextProps, style: normalizedStyle };
      }
    }

    return originalCreateElement(type, nextProps, ...children);
  }) as typeof reactAny.createElement;

  const originalWarn = console.warn.bind(console);
  console.warn = (...args: unknown[]) => {
    const firstArg = typeof args[0] === 'string' ? args[0] : '';
    if (firstArg === 'props.pointerEvents is deprecated. Use style.pointerEvents') {
      return;
    }
    originalWarn(...args);
  };

  globalRecord[INSTALL_KEY] = true;
}

installCompatPatches();
