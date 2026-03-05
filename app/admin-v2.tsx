import React from 'react';
import { Pressable, ScrollView, StyleSheet, View, RefreshControl, PanResponder } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, useRouter } from 'expo-router';
import { Circle, Defs, LinearGradient, Path, Stop, Svg } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '../src/components/AppButton';
import { AppScreen } from '../src/components/AppScreen';
import { AppText } from '../src/components/AppText';
import { useAdminAuth } from '../src/features/admin/hooks/useAdminAuth';
import { colors, radius, spacing } from '../src/theme';

type TrendTone = 'up' | 'down' | 'flat';
type TimeWindow = '24H' | '7D' | '30D';

type OverviewMetric = {
  id: string;
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  trendValue?: string;
  trendTone?: TrendTone;
  series: Record<TimeWindow, number[]>;
};

const WINDOW_OPTIONS: TimeWindow[] = ['24H', '7D', '30D'];

const WINDOW_LABELS: Record<TimeWindow, [string, string, string, string]> = {
  '24H': ['00:00', '08:00', '16:00', 'Now'],
  '7D': ['Mon', 'Wed', 'Fri', 'Today'],
  '30D': ['30d', '20d', '10d', 'Today'],
};

const PRIMARY_METRICS: OverviewMetric[] = [
  {
    id: 'activeUsers',
    label: 'ACTIVE USERS',
    value: 14203,
    trendValue: '+12.0%',
    trendTone: 'up',
    series: {
      '24H': [12100, 12800, 11900, 13400, 13100, 13900, 14203],
      '7D': [11400, 12900, 12200, 13800, 13400, 14000, 14203],
      '30D': [9800, 11200, 10500, 12600, 12100, 13500, 14203],
    },
  },
  {
    id: 'liveStreams',
    label: 'LIVE STREAMS',
    value: 842,
    trendValue: '+4.8%',
    trendTone: 'up',
    series: {
      '24H': [650, 780, 690, 810, 760, 830, 842],
      '7D': [580, 720, 640, 780, 710, 800, 842],
      '30D': [420, 590, 510, 680, 630, 760, 842],
    },
  },
  {
    id: 'newSignUps',
    label: 'NEW SIGN-UPS',
    value: 1936,
    trendValue: '+6.1%',
    trendTone: 'up',
    series: {
      '24H': [1200, 1500, 1350, 1700, 1600, 1850, 1936],
      '7D': [900, 1300, 1150, 1600, 1450, 1800, 1936],
      '30D': [500, 950, 800, 1300, 1100, 1650, 1936],
    },
  },
  {
    id: 'subscribers',
    label: 'SUBSCRIBERS',
    value: 48210,
    trendValue: '+3.4%',
    trendTone: 'up',
    series: {
      '24H': [47100, 47300, 47250, 47600, 47550, 47900, 48210],
      '7D': [46000, 46500, 46300, 47100, 46900, 47800, 48210],
      '30D': [41000, 43500, 42800, 45200, 44600, 47100, 48210],
    },
  },
  {
    id: 'dailyReports',
    label: 'DAILY REPORTS',
    value: 128,
    trendValue: '-2.3%',
    trendTone: 'down',
    series: {
      '24H': [180, 145, 160, 135, 150, 130, 128],
      '7D': [210, 165, 185, 150, 170, 135, 128],
      '30D': [320, 250, 280, 210, 230, 160, 128],
    },
  },
];

const CURRENCY_METRICS: OverviewMetric[] = [
  {
    id: 'gemsCirculation',
    label: 'GEMS CIRCULATION',
    value: 18400000,
    trendValue: '+1.9%',
    trendTone: 'up',
    series: {
      '24H': [17500000, 18100000, 17800000, 18300000, 18100000, 18350000, 18400000],
      '7D': [16800000, 17600000, 17200000, 18100000, 17700000, 18300000, 18400000],
      '30D': [14200000, 15800000, 15100000, 17200000, 16500000, 18100000, 18400000],
    },
  },
  {
    id: 'fuelCirculation',
    label: 'FUEL CIRCULATION',
    value: 9250000,
    trendValue: '+0.6%',
    trendTone: 'up',
    series: {
      '24H': [8900000, 9150000, 9050000, 9200000, 9120000, 9230000, 9250000],
      '7D': [8500000, 8900000, 8750000, 9100000, 8950000, 9200000, 9250000],
      '30D': [7800000, 8400000, 8100000, 8800000, 8500000, 9100000, 9250000],
    },
  },
  {
    id: 'cashCirculation',
    label: 'CASH CIRCULATION',
    value: 84392000,
    prefix: '$',
    trendValue: '+2.7%',
    trendTone: 'up',
    series: {
      '24H': [81200000, 83500000, 82400000, 84100000, 83200000, 84250000, 84392000],
      '7D': [77500000, 81200000, 79800000, 83100000, 81900000, 83900000, 84392000],
      '30D': [68000000, 74500000, 71200000, 79800000, 76500000, 82400000, 84392000],
    },
  },
];

const SYSTEM_LOGS = [
  { time: '14.02.44', message: 'User 88 sent 500 gems to User 99', tone: 'up' as TrendTone },
  { time: '14.03.09', message: 'User 12 issued wallet credit +1200 cash', tone: 'up' as TrendTone },
  { time: '14.03.28', message: 'Live room #402 moderation lock enabled', tone: 'flat' as TrendTone },
  { time: '14.04.11', message: 'User 61 reversed payout request #A91', tone: 'down' as TrendTone },
  { time: '14.05.02', message: 'User 205 sent 75 gems to User 17', tone: 'up' as TrendTone },
  { time: '14.05.31', message: 'Global incident broadcast sent (tier-2)', tone: 'flat' as TrendTone },
] as const;

function formatMetricValue(metric: OverviewMetric, value: number): string {
  const rounded = Math.round(value);
  const formatted = new Intl.NumberFormat('en-US').format(rounded);
  return `${metric.prefix ?? ''}${formatted}${metric.suffix ?? ''}`;
}

function getTooltipLabel(window: TimeWindow, index: number): string {
  if (window === '24H') {
    const hours = ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', 'Now'];
    return hours[index] || 'Now';
  }
  if (window === '7D') {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Today'];
    return days[index] || 'Today';
  }
  const days30 = ['30d ago', '25d ago', '20d ago', '15d ago', '10d ago', '5d ago', 'Today'];
  return days30[index] || 'Today';
}

function buildChart(values: number[], height: number = 100) {
  const width = 320;

  if (values.length < 2) {
    return {
      linePath: 'M0,50 L320,50',
      areaPath: 'M0,50 L320,50 L320,100 L0,100 Z',
      activeIndex: 0,
      activeXPercent: 0,
      activeYPercent: 50,
    };
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);

  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = height - ((value - min) / range) * (height - 12) - 6;
    return { x, y };
  });

  let linePath = `M ${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const curr = points[i];
    const next = points[i + 1];
    const midX = (curr.x + next.x) / 2;
    linePath += ` C ${midX},${curr.y} ${midX},${next.y} ${next.x},${next.y}`;
  }

  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;

  const activeIndex = values.length - 1;
  const activePoint = points[activeIndex];

  return {
    linePath,
    areaPath,
    activeIndex,
    activeXPercent: (activePoint.x / width) * 100,
    activeYPercent: (activePoint.y / height) * 100,
  };
}

function TrendPill({ value, tone, t }: { value: string; tone: TrendTone; t: any }) {
  const isUp = tone === 'up';
  const isDown = tone === 'down';
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xs,
          borderRadius: 4,
          borderWidth: 1,
          paddingHorizontal: spacing.sm,
          paddingVertical: spacing.xsMinus,
        },
        isUp && { backgroundColor: t.trendUpBg, borderColor: t.trendUpBorder },
        isDown && { backgroundColor: t.trendDownBg, borderColor: t.trendDownBorder },
        tone === 'flat' && { backgroundColor: t.trendFlatBg, borderColor: t.trendFlatBorder },
      ]}
    >
      <Ionicons
        name={isUp ? 'trending-up-outline' : isDown ? 'trending-down-outline' : 'remove-outline'}
        size={13}
        color={isUp ? t.trendUpText : isDown ? t.trendDownText : t.textMuted}
      />
      <AppText
        variant="tinyBold"
        style={{
          color: isUp ? t.trendUpText : isDown ? t.trendDownText : t.trendFlatText,
        }}
      >
        {value}
      </AppText>
    </View>
  );
}

function OverviewMetricCard({
  metric,
  isExpanded,
  selectedWindow,
  onWindowChange,
  onToggle,
  t,
  onScrubStateChange,
}: {
  metric: OverviewMetric;
  isExpanded: boolean;
  selectedWindow: TimeWindow;
  onWindowChange: (window: TimeWindow) => void;
  onToggle: () => void;
  t: any;
  onScrubStateChange?: (isScrubbing: boolean) => void;
}) {
  const chart = React.useMemo(() => buildChart(metric.series[selectedWindow]), [metric.series, selectedWindow]);
  const labels = WINDOW_LABELS[selectedWindow];
  const gradientId = `metricGradient-${metric.id}`;

  // Interactive scrubbing state
  const [scrubIndex, setScrubIndex] = React.useState<number | null>(null);

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          if (onScrubStateChange) onScrubStateChange(true);
          const { locationX } = evt.nativeEvent;
          const index = Math.round((locationX / 320) * (metric.series[selectedWindow].length - 1));
          setScrubIndex(Math.max(0, Math.min(index, metric.series[selectedWindow].length - 1)));
        },
        onPanResponderMove: (evt) => {
          const { locationX } = evt.nativeEvent;
          const index = Math.round((locationX / 320) * (metric.series[selectedWindow].length - 1));
          setScrubIndex(Math.max(0, Math.min(index, metric.series[selectedWindow].length - 1)));
        },
        onPanResponderRelease: () => {
          setScrubIndex(null);
          if (onScrubStateChange) onScrubStateChange(false);
        },
        onPanResponderTerminate: () => {
          setScrubIndex(null);
          if (onScrubStateChange) onScrubStateChange(false);
        },
      }),
    [metric.series, selectedWindow, onScrubStateChange]
  );

  const displayIndex = scrubIndex !== null ? scrubIndex : null;
  const showTooltip = displayIndex !== null;
  const tooltipLabel = showTooltip ? getTooltipLabel(selectedWindow, displayIndex) : '';
  const tooltipValue = showTooltip ? formatMetricValue(metric, metric.series[selectedWindow][displayIndex]) : '';

  // Calculate position for the active scrubbing point
  const displayPointX = showTooltip ? (displayIndex / (metric.series[selectedWindow].length - 1)) * 320 : 0;
  const displayPointY = showTooltip
    ? 100 -
      ((metric.series[selectedWindow][displayIndex] - Math.min(...metric.series[selectedWindow])) /
        Math.max(1, Math.max(...metric.series[selectedWindow]) - Math.min(...metric.series[selectedWindow]))) *
        (100 - 12) -
      6
    : 0;

  return (
    <View
      style={[
        { backgroundColor: t.surface },
        isExpanded && {
          shadowColor: '#000000',
          shadowOpacity: t.isDark ? 0.3 : 0.06,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 6 },
          elevation: 2,
          zIndex: 10,
        },
      ]}
    >
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [{ borderRadius: 2 }, pressed && { opacity: 0.85 }]}
      >
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.lg,
            paddingBottom: spacing.sm,
            gap: spacing.md,
          }}
        >
          <View style={{ gap: 4, flexShrink: 1 }}>
            <AppText variant="micro" style={{ color: t.textMuted, letterSpacing: 1.2 }}>
              {metric.label}
            </AppText>
            <AppText variant="h1" style={{ color: t.text }}>
              {formatMetricValue(metric, metric.value)}
            </AppText>
            {!isExpanded ? (
              <AppText variant="tiny" style={{ color: t.textMuted, opacity: 0.8 }}>
                Tap to expand trend
              </AppText>
            ) : null}
          </View>
          {metric.trendValue ? (
            <TrendPill value={metric.trendValue} tone={metric.trendTone ?? 'flat'} t={t} />
          ) : null}
        </View>
      </Pressable>

      {isExpanded ? (
        <>
          <View
            style={{
              height: 188,
              position: 'relative',
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.sm,
              paddingBottom: spacing.md,
            }}
            {...panResponder.panHandlers}
          >
            {showTooltip && (
              <View
                style={{
                  position: 'absolute',
                  left: `${(displayPointX / 320) * 100}%`,
                  top: 4,
                  zIndex: 3,
                  alignItems: 'center',
                  transform: [{ translateX: -40 }],
                  width: 80,
                  pointerEvents: 'none',
                }}
              >
                <View
                  style={{
                    backgroundColor: t.tooltipBg,
                    borderRadius: 4,
                    paddingHorizontal: spacing.xs,
                    paddingVertical: spacing.xxs,
                    marginBottom: spacing.xs,
                    shadowColor: '#000',
                    shadowOpacity: 0.1,
                    shadowRadius: 4,
                    elevation: 2,
                    alignItems: 'center',
                  }}
                >
                  <AppText variant="micro" style={{ color: t.tooltipText }}>
                    {tooltipLabel}
                  </AppText>
                  <AppText variant="tinyBold" style={{ color: t.tooltipText }}>
                    {tooltipValue}
                  </AppText>
                </View>
                <View
                  style={{
                    width: 1,
                    height: 132,
                    borderRightWidth: 1,
                    borderRightColor: t.textMuted,
                    borderStyle: 'dashed',
                    opacity: 0.5,
                  }}
                />
              </View>
            )}

            <Svg width="100%" height="100%" viewBox="0 0 320 100" preserveAspectRatio="none">
              <Defs>
                <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0%" stopColor="#10B76C" stopOpacity="0.18" />
                  <Stop offset="100%" stopColor="#10B76C" stopOpacity="0" />
                </LinearGradient>
              </Defs>
              <Path d={chart.areaPath} fill={`url(#${gradientId})`} stroke="none" />
              <Path d={chart.linePath} fill="none" stroke={t.chartLine} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              {showTooltip && (
                <Circle
                  cx={displayPointX}
                  cy={displayPointY}
                  r="4.5"
                  fill={t.chartLine}
                  stroke={t.surface}
                  strokeWidth={2}
                />
              )}
            </Svg>

            <View
              style={{
                position: 'absolute',
                bottom: spacing.xs,
                left: spacing.lg,
                right: spacing.lg,
                flexDirection: 'row',
                justifyContent: 'space-between',
              }}
            >
              {labels.map((label) => (
                <AppText
                  key={`${metric.id}-${selectedWindow}-${label}`}
                  variant="micro"
                  style={{ color: t.textMuted, opacity: 0.85, letterSpacing: 0.4 }}
                >
                  {label}
                </AppText>
              ))}
            </View>
          </View>

          <View
            style={{
              marginHorizontal: spacing.lg,
              marginBottom: spacing.md,
              marginTop: spacing.xs,
              borderRadius: 4,
              backgroundColor: t.surfaceAlt,
              padding: 2,
              flexDirection: 'row',
              gap: 2,
            }}
          >
            {WINDOW_OPTIONS.map((window) => {
              const isActive = window === selectedWindow;
              return (
                <Pressable
                  key={`${metric.id}-${window}`}
                  style={[
                    { flex: 1, borderRadius: 3, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xs },
                    isActive && { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border },
                  ]}
                  onPress={() => onWindowChange(window)}
                >
                  <AppText variant="tiny" style={{ color: isActive ? t.text : t.textMuted }}>
                    {window}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}
    </View>
  );
}

export default function AdminV2Screen() {
  return <Redirect href="/admin" />;

  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAdmin } = useAdminAuth();
  const [expandedMetricId, setExpandedMetricId] = React.useState<string | null>(null);
  const [selectedWindow, setSelectedWindow] = React.useState<TimeWindow>('7D');
  const [isDark, setIsDark] = React.useState<boolean>(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [isScrubbingChart, setIsScrubbingChart] = React.useState(false);

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    // Simulate network request
    setTimeout(() => {
      setRefreshing(false);
    }, 1200);
  }, []);

  const t = React.useMemo(
    () => ({
      isDark,
      bg: isDark ? '#09090B' : '#F4F4F5',
      surface: isDark ? '#18181B' : '#FFFFFF',
      surfaceAlt: isDark ? '#27272A' : '#F4F4F5',
      border: isDark ? '#27272A' : '#E4E4E7',
      borderSubtle: isDark ? '#3F3F46' : '#E4E4E7',
      text: isDark ? '#FFFFFF' : '#111111',
      textMuted: isDark ? '#A1A1AA' : '#71717A',
      chartLine: '#10B76C',
      tooltipBg: isDark ? '#FFFFFF' : '#111111',
      tooltipText: isDark ? '#111111' : '#FFFFFF',
      trendUpBg: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
      trendUpBorder: isDark ? 'rgba(16, 185, 129, 0.2)' : '#D1FAE5',
      trendUpText: '#10B981',
      trendDownBg: isDark ? 'rgba(244, 63, 94, 0.15)' : '#FFF1F2',
      trendDownBorder: isDark ? 'rgba(244, 63, 94, 0.2)' : '#FFE4E6',
      trendDownText: '#F43F5E',
      trendFlatBg: isDark ? '#27272A' : '#F4F4F5',
      trendFlatBorder: isDark ? '#3F3F46' : '#E4E4E7',
      trendFlatText: isDark ? '#A1A1AA' : '#52525B',
      navBg: isDark ? 'rgba(24, 24, 27, 0.96)' : 'rgba(255, 255, 255, 0.96)',
      danger: '#F43F5E',
    }),
    [isDark]
  );

  const toggleMetric = (metricId: string) => {
    setExpandedMetricId((current) => (current === metricId ? null : metricId));
  };

  if (!isAdmin) {
    return (
      <AppScreen style={{ justifyContent: 'center', alignItems: 'center', backgroundColor: t.bg }}>
        <View style={[styles.deniedCard, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Ionicons name="lock-closed" size={36} color={colors.accentDanger} />
          <AppText variant="h3">Admin Only</AppText>
          <AppText secondary style={styles.deniedBody}>
            You can only open this preview with an admin account.
          </AppText>
          <AppButton title="Back Home" onPress={() => router.replace('/' as any)} />
        </View>
      </AppScreen>
    );
  }

  return (
    <AppScreen noPadding style={{ backgroundColor: t.bg }}>
      <View style={{ flex: 1, alignItems: 'center', backgroundColor: t.bg }}>
        <View style={{ width: '100%', maxWidth: 460, flex: 1, backgroundColor: t.bg, position: 'relative' }}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottomWidth: 1,
              borderBottomColor: t.border,
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.md,
              backgroundColor: t.surface,
              zIndex: 2,
            }}
          >
            <AppText variant="h3" style={{ color: t.text }}>
              Overview
            </AppText>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <AppText variant="micro" style={{ color: t.textMuted, letterSpacing: 0.4 }}>
                OCT 24
              </AppText>
              <Pressable
                style={{ width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: t.border, backgroundColor: t.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}
                onPress={() => setIsDark(!isDark)}
              >
                <Ionicons name={isDark ? 'sunny' : 'moon'} size={14} color={t.textMuted} />
              </Pressable>
            </View>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 100 }}
            showsVerticalScrollIndicator={false}
            scrollEnabled={!isScrubbingChart}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={t.chartLine}
                colors={[t.chartLine]}
              />
            }
          >
            <View style={{ backgroundColor: t.borderSubtle, gap: 1 }}>
              {PRIMARY_METRICS.map((metric) => (
                <OverviewMetricCard
                  key={metric.id}
                  metric={metric}
                  isExpanded={expandedMetricId === metric.id}
                  selectedWindow={selectedWindow}
                  onWindowChange={setSelectedWindow}
                  onToggle={() => toggleMetric(metric.id)}
                  t={t}
                  onScrubStateChange={setIsScrubbingChart}
                />
              ))}

              <View style={{ backgroundColor: t.surface, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderTopWidth: 2, borderBottomWidth: 2, borderColor: t.border, marginTop: spacing.xs, marginBottom: spacing.xs }}>
                <AppText variant="micro" style={{ color: t.text, fontWeight: '600', letterSpacing: 1.2 }}>
                  TOTAL CURRENCY CIRCULATION
                </AppText>
              </View>

              {CURRENCY_METRICS.map((metric) => (
                <OverviewMetricCard
                  key={metric.id}
                  metric={metric}
                  isExpanded={expandedMetricId === metric.id}
                  selectedWindow={selectedWindow}
                  onWindowChange={setSelectedWindow}
                  onToggle={() => toggleMetric(metric.id)}
                  t={t}
                  onScrubStateChange={setIsScrubbingChart}
                />
              ))}
            </View>

            <View style={{ borderTopWidth: 1, borderTopColor: t.border, borderBottomWidth: 1, borderBottomColor: t.border, backgroundColor: t.surface, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.md, marginTop: spacing.md }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <AppText variant="smallBold" style={{ color: t.text }}>
                  System Log
                </AppText>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                  <AppText variant="micro" style={{ color: t.chartLine, letterSpacing: 0.8 }}>
                    LIVE
                  </AppText>
                  <Pressable
                    onPress={() => router.push({ pathname: '/admin-logs', params: { isDark: isDark ? '1' : '0' } } as any)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: t.surfaceAlt, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 }}
                  >
                    <AppText variant="micro" style={{ color: t.textMuted }}>Expand</AppText>
                    <Ionicons name="expand-outline" size={12} color={t.textMuted} />
                  </Pressable>
                </View>
              </View>

              <View style={{ gap: spacing.sm }}>
                {SYSTEM_LOGS.map((entry) => (
                  <View key={`${entry.time}-${entry.message}`} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                    <AppText variant="tiny" style={{ color: t.textMuted, width: 56 }}>
                      {entry.time}
                    </AppText>
                    <View
                      style={[
                        { width: 6, height: 6, borderRadius: 3, marginRight: spacing.xs },
                        entry.tone === 'up' && { backgroundColor: t.trendUpText },
                        entry.tone === 'down' && { backgroundColor: t.trendDownText },
                        entry.tone === 'flat' && { backgroundColor: t.textMuted },
                      ]}
                    />
                    <AppText variant="tiny" style={{ color: t.text, flex: 1, lineHeight: 18 }}>
                      {entry.message}
                    </AppText>
                  </View>
                ))}
              </View>
            </View>

            <View style={{ height: 120 }} />
          </ScrollView>

          <View
            style={{
              position: 'absolute', left: 0, right: 0, bottom: 0,
              borderTopWidth: 1, borderTopColor: t.border, backgroundColor: t.navBg,
              paddingTop: spacing.xs, paddingHorizontal: spacing.xs, flexDirection: 'row', justifyContent: 'space-around',
              paddingBottom: Math.max(insets.bottom, spacing.sm),
            }}
          >
            <Pressable style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, paddingVertical: spacing.xs }}>
              <Ionicons name="grid-outline" size={20} color={t.text} />
              <AppText variant="micro" style={{ color: t.text }}>
                Home
              </AppText>
            </Pressable>
            <Pressable style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, paddingVertical: spacing.xs }}>
              <Ionicons name="bar-chart-outline" size={20} color={t.textMuted} />
              <AppText variant="micro" style={{ color: t.textMuted }}>
                Analytics
              </AppText>
            </Pressable>
            <Pressable style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, paddingVertical: spacing.xs }}>
              <Ionicons name="wallet-outline" size={20} color={t.textMuted} />
              <AppText variant="micro" style={{ color: t.textMuted }}>
                Economy
              </AppText>
            </Pressable>
            <Pressable style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, paddingVertical: spacing.xs }}>
              <Ionicons name="settings-outline" size={20} color={t.textMuted} />
              <AppText variant="micro" style={{ color: t.textMuted }}>
                Settings
              </AppText>
            </Pressable>
          </View>
        </View>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#FFFFFF',
  },
  shellWrap: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  shell: {
    width: '100%',
    maxWidth: 460,
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderColor: '#E4E4E7',
    borderWidth: StyleSheet.hairlineWidth,
    position: 'relative',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E4E4E7',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: '#FFFFFF',
    zIndex: 2,
  },
  headerTitle: {
    color: '#111111',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerDate: {
    color: '#A1A1AA',
    letterSpacing: 0.4,
  },
  avatarButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#E4E4E7',
    backgroundColor: '#F4F4F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingBottom: spacing.xl,
  },
  metricStack: {
    backgroundColor: '#E4E4E7',
    gap: 1,
  },
  metricCard: {
    backgroundColor: '#FFFFFF',
  },
  metricHeaderPressable: {
    borderRadius: 2,
  },
  metricHeaderPressableActive: {
    opacity: 0.85,
  },
  expandedMetricCard: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  metricHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.md,
  },
  metricCopy: {
    gap: 4,
    flexShrink: 1,
  },
  metricLabel: {
    color: '#52525B',
    letterSpacing: 1.2,
  },
  metricValue: {
    color: '#111111',
  },
  metricHint: {
    color: '#A1A1AA',
  },
  metricSectionHeader: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#E4E4E7',
  },
  metricSectionTitle: {
    color: '#71717A',
    letterSpacing: 1.2,
  },
  trendPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: 4,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xsMinus,
  },
  trendPillUp: {
    backgroundColor: '#ECFDF5',
    borderColor: '#D1FAE5',
  },
  trendPillDown: {
    backgroundColor: '#FFF1F2',
    borderColor: '#FFE4E6',
  },
  trendPillFlat: {
    backgroundColor: '#F4F4F5',
    borderColor: '#E4E4E7',
  },
  trendText: {
    color: '#52525B',
  },
  trendTextUp: {
    color: '#10B981',
  },
  trendTextDown: {
    color: '#F43F5E',
  },
  chartArea: {
    height: 188,
    position: 'relative',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  chartCursorWrap: {
    position: 'absolute',
    left: '58%',
    top: 4,
    zIndex: 3,
    alignItems: 'center',
    transform: [{ translateX: -20 }],
  },
  chartTooltip: {
    backgroundColor: '#111111',
    borderRadius: 4,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
    marginBottom: spacing.xs,
  },
  chartTooltipText: {
    color: '#FFFFFF',
  },
  chartCursorLine: {
    width: 1,
    height: 132,
    borderRightWidth: 1,
    borderRightColor: '#A1A1AA',
    borderStyle: 'dashed',
  },
  chartDot: {
    position: 'absolute',
    left: '58%',
    top: '39%',
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: '#10B76C',
    transform: [{ translateX: -5 }, { translateY: -5 }],
    zIndex: 4,
  },
  chartLabels: {
    position: 'absolute',
    bottom: spacing.xs,
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  chartLabelText: {
    color: '#A1A1AA',
    opacity: 0.85,
    letterSpacing: 0.4,
  },
  timeframeWrap: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    marginTop: spacing.xs,
    borderRadius: 4,
    backgroundColor: '#F4F4F5',
    padding: 2,
    flexDirection: 'row',
    gap: 2,
  },
  timeframeButton: {
    flex: 1,
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs,
  },
  timeframeButtonActive: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  timeframeText: {
    color: '#52525B',
  },
  timeframeTextActive: {
    color: '#111111',
  },
  deepDiveRow: {
    borderTopWidth: 1,
    borderTopColor: '#E4E4E7',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  deepDiveText: {
    color: '#52525B',
  },
  systemLogCard: {
    borderTopWidth: 1,
    borderTopColor: '#E4E4E7',
    borderBottomWidth: 1,
    borderBottomColor: '#E4E4E7',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  systemLogHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  systemLogTitle: {
    color: '#111111',
  },
  systemLogMeta: {
    color: '#10B76C',
    letterSpacing: 0.8,
  },
  systemLogList: {
    gap: spacing.sm,
  },
  systemLogRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  systemLogTime: {
    color: '#A1A1AA',
    width: 56,
  },
  systemLogDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: spacing.xs,
  },
  systemLogDotUp: {
    backgroundColor: '#10B981',
  },
  systemLogDotDown: {
    backgroundColor: '#F43F5E',
  },
  systemLogDotFlat: {
    backgroundColor: '#A1A1AA',
  },
  systemLogMessage: {
    color: '#27272A',
    flex: 1,
    lineHeight: 18,
  },
  bottomSpacer: {
    height: 120,
  },
  bottomNav: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    borderTopColor: '#E4E4E7',
    backgroundColor: 'rgba(255,255,255,0.96)',
    paddingTop: spacing.xs,
    paddingHorizontal: spacing.xs,
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: spacing.xs,
  },
  navItemActive: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: spacing.xs,
  },
  navLabel: {
    color: '#A1A1AA',
  },
  navLabelActive: {
    color: '#111111',
  },
  deniedCard: {
    width: '100%',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#E4E4E7',
    backgroundColor: '#FFFFFF',
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
  },
  deniedScreen: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  deniedBody: {
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
});
