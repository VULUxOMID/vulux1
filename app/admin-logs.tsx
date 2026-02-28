import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppScreen } from '../src/components/AppScreen';
import { AppText } from '../src/components/AppText';
import { useAdminAuth } from '../src/features/admin/hooks/useAdminAuth';
import { spacing } from '../src/theme';

type LogTone = 'up' | 'down' | 'flat';
type LogType = 'economy' | 'moderation' | 'system' | 'auth';

const ALL_LOGS = [
  { id: '1', time: '14.02.44', type: 'economy', message: 'User 88 sent 500 gems to User 99', tone: 'up' as LogTone },
  { id: '2', time: '14.03.09', type: 'economy', message: 'User 12 issued wallet credit +1200 cash', tone: 'up' as LogTone },
  { id: '3', time: '14.03.28', type: 'moderation', message: 'Live room #402 moderation lock enabled', tone: 'flat' as LogTone },
  { id: '4', time: '14.04.11', type: 'economy', message: 'User 61 reversed payout request #A91', tone: 'down' as LogTone },
  { id: '5', time: '14.05.02', type: 'economy', message: 'User 205 sent 75 gems to User 17', tone: 'up' as LogTone },
  { id: '6', time: '14.05.31', type: 'system', message: 'Global incident broadcast sent (tier-2)', tone: 'flat' as LogTone },
  { id: '7', time: '14.06.15', type: 'auth', message: 'Failed TOTP attempt for admin account Omid', tone: 'down' as LogTone },
  { id: '8', time: '14.08.22', type: 'moderation', message: 'User 402 banned from live streams', tone: 'down' as LogTone },
  { id: '9', time: '14.10.05', type: 'system', message: 'Database backup snapshot completed', tone: 'up' as LogTone },
  { id: '10', time: '14.12.30', type: 'auth', message: 'New device login for User 11', tone: 'flat' as LogTone },
];

const FILTERS: { label: string; value: LogType | 'all' }[] = [
  { label: 'All Logs', value: 'all' },
  { label: 'Economy', value: 'economy' },
  { label: 'Moderation', value: 'moderation' },
  { label: 'System', value: 'system' },
  { label: 'Auth', value: 'auth' },
];

export default function AdminLogsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const { isAdmin } = useAdminAuth();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<LogType | 'all'>('all');

  const isDark = params.isDark === '1';

  const t = React.useMemo(
    () => ({
      isDark,
      bg: isDark ? '#09090B' : '#F4F4F5',
      surface: isDark ? '#18181B' : '#FFFFFF',
      surfaceAlt: isDark ? '#27272A' : '#F4F4F5',
      border: isDark ? '#27272A' : '#E4E4E7',
      text: isDark ? '#FFFFFF' : '#111111',
      textMuted: isDark ? '#A1A1AA' : '#71717A',
      trendUpBg: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
      trendUpText: '#10B981',
      trendDownBg: isDark ? 'rgba(244, 63, 94, 0.15)' : '#FFF1F2',
      trendDownText: '#F43F5E',
    }),
    [isDark]
  );

  if (!isAdmin) {
    return (
      <AppScreen style={{ justifyContent: 'center', alignItems: 'center' }}>
        <AppText variant="h3">Admin Only</AppText>
      </AppScreen>
    );
  }

  const filteredLogs = ALL_LOGS.filter((log) => {
    const matchesFilter = activeFilter === 'all' || log.type === activeFilter;
    const matchesSearch = log.message.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <AppScreen noPadding style={{ backgroundColor: t.bg }}>
      <View style={{ flex: 1, alignItems: 'center', backgroundColor: t.bg }}>
        <View style={{ width: '100%', maxWidth: 460, flex: 1, backgroundColor: t.bg, position: 'relative' }}>
          {/* Header */}
          <View style={{ backgroundColor: t.surface, borderBottomWidth: 1, borderBottomColor: t.border, paddingBottom: spacing.sm, paddingTop: Math.max(insets.top, spacing.md) }}> 
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.sm, marginBottom: spacing.md }}>
              <Pressable onPress={() => router.back()} style={{ padding: spacing.sm }}>
                <Ionicons name="arrow-back" size={24} color={t.text} />
              </Pressable>
              <AppText variant="h3" style={{ color: t.text }}>System Log</AppText>
              <View style={{ width: 40 }} /> {/* Spacer for centering */}
            </View>

            {/* Search Bar */}
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: t.surfaceAlt, marginHorizontal: spacing.lg, borderRadius: 8, paddingHorizontal: spacing.md, height: 44, marginBottom: spacing.md, borderWidth: 1, borderColor: t.border }}>
              <Ionicons name="search" size={20} color={t.textMuted} style={{ marginRight: spacing.sm }} />
              <TextInput
                style={{ flex: 1, height: '100%', color: t.text, fontSize: 15 }}
                placeholder="Search logs, user IDs, events..."
                placeholderTextColor={t.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <Pressable onPress={() => setSearchQuery('')} style={{ padding: spacing.xs }}>
                  <Ionicons name="close-circle" size={16} color={t.textMuted} />
                </Pressable>
              )}
            </View>

            {/* Filters */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 36 }} contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}>
              {FILTERS.map((f) => {
                const isActive = activeFilter === f.value;
                return (
                  <Pressable
                    key={f.value}
                    onPress={() => setActiveFilter(f.value)}
                    style={[
                      { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: 16, backgroundColor: t.surfaceAlt, borderWidth: 1, borderColor: t.border, justifyContent: 'center' },
                      isActive && { backgroundColor: t.text, borderColor: t.text }
                    ]}
                  >
                    <AppText variant="tinyBold" style={{ color: isActive ? t.bg : t.textMuted }}>
                      {f.label}
                    </AppText>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* Log List */}
          <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
            {filteredLogs.length === 0 ? (
              <View style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: spacing.sm }}>
                <Ionicons name="document-text-outline" size={48} color={t.border} />
                <AppText variant="body" style={{ color: t.textMuted }}>No logs match your criteria</AppText>
              </View>
            ) : (
              filteredLogs.map((entry) => (
                <View key={entry.id} style={{ flexDirection: 'row', alignItems: 'flex-start', backgroundColor: t.surface, padding: spacing.md, borderRadius: 8, borderWidth: 1, borderColor: t.border }}>
                  <AppText variant="tiny" style={{ color: t.textMuted, width: 56, paddingTop: 2 }}>{entry.time}</AppText>
                  <View
                    style={[
                      { width: 8, height: 8, borderRadius: 4, marginTop: 6, marginRight: spacing.sm },
                      entry.tone === 'up' && { backgroundColor: t.trendUpText },
                      entry.tone === 'down' && { backgroundColor: t.trendDownText },
                      entry.tone === 'flat' && { backgroundColor: t.textMuted },
                    ]}
                  />
                  <View style={{ flex: 1, gap: 4 }}>
                    <AppText variant="body" style={{ color: t.text, lineHeight: 20 }}>{entry.message}</AppText>
                    <AppText variant="micro" style={{ color: t.textMuted, letterSpacing: 0.5 }}>{entry.type.toUpperCase()}</AppText>
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({});
