import React, { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '../../../theme';
import { ADMIN_TABS, type AdminTabId } from '../adminTabs';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { useAdminIncidentCenter } from '../hooks/useAdminIncidentCenter';
import {
  AdminActionBanner,
  AdminButton,
  AdminPageHeader,
  AdminSectionHeader,
} from '../ui/AdminLayout';
import { adminTokens } from '../ui/adminTokens';
import { AuditLogsTab } from '../tabs/AuditLogsTab';
import { ContentOpsTab } from '../tabs/ContentOpsTab';
import { EventsTab } from '../tabs/EventsTab';
import { ExportDataTab } from '../tabs/ExportDataTab';
import { FinanceTab } from '../tabs/FinanceTab';
import { HealthTab } from '../tabs/HealthTab';
import { IncidentCenterTab } from '../tabs/IncidentCenterTab';
import { MessageModerationTab } from '../tabs/MessageModerationTab';
import { OperationsTab } from '../tabs/DashboardOpsTab';
import { ReportsTab } from '../tabs/ReportsTab';
import { SupportTab } from '../tabs/SupportTab';
import { SystemTab } from '../tabs/SystemTab';
import { UsersTab } from '../tabs/UsersTab';

export function AdminOperationsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { adminRole, canPerform } = useAdminAuth();
  const [activeTab, setActiveTab] = useState<AdminTabId>('operations');
  const incidentCenter = useAdminIncidentCenter();

  const availableTabs = useMemo(
    () => ADMIN_TABS.filter((tab) => !tab.requiredAction || canPerform(tab.requiredAction)),
    [canPerform],
  );

  const maintenanceMode = incidentCenter.snapshot?.maintenanceMode;
  const maintenanceMessage = maintenanceMode?.message?.trim()
    ? maintenanceMode.message.trim()
    : 'Administrative maintenance mode is active.';

  useEffect(() => {
    if (availableTabs.some((tab) => tab.id === activeTab)) {
      return;
    }

    setActiveTab(availableTabs[0]?.id ?? 'operations');
  }, [activeTab, availableTabs]);

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'operations':
        return <OperationsTab onNavigate={setActiveTab} />;
      case 'health':
        return <HealthTab />;
      case 'incidents':
        return (
          <IncidentCenterTab
            snapshot={incidentCenter.snapshot}
            loading={incidentCenter.loading}
            error={incidentCenter.error}
            refetch={incidentCenter.refetch}
            toggleMaintenanceMode={incidentCenter.toggleMaintenanceMode}
            broadcastAlert={incidentCenter.broadcastAlert}
            resolveIncident={incidentCenter.resolveIncident}
          />
        );
      case 'users':
        return <UsersTab />;
      case 'moderation':
        return <MessageModerationTab />;
      case 'reports':
        return <ReportsTab />;
      case 'finance':
        return <FinanceTab />;
      case 'events':
        return <EventsTab />;
      case 'contentOps':
        return <ContentOpsTab />;
      case 'support':
        return <SupportTab />;
      case 'exports':
        return <ExportDataTab />;
      case 'auditLogs':
        return <AuditLogsTab />;
      case 'system':
        return <SystemTab />;
      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + (Platform.OS === 'ios' ? 0 : 8) },
        ]}
      >
        <AdminPageHeader
          title="Admin"
          description={`Moderation, system health, and incident response for Vulu. Current tier: ${adminRole ?? 'NONE'}.`}
          actions={
            <AdminButton
              label="Exit Admin"
              tone="neutral"
              icon="close"
              onPress={() => router.replace('/' as any)}
            />
          }
        />

        {maintenanceMode?.enabled ? (
          <AdminActionBanner
            tone="danger"
            message={`Maintenance mode active: ${maintenanceMessage}`}
          />
        ) : null}

        <AdminSectionHeader
          title="Workspaces"
          description="Switch between operational domains."
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabScrollContent}
        >
          {availableTabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <Pressable
                key={tab.id}
                style={[styles.tabButton, isActive && styles.tabButtonActive]}
                onPress={() => setActiveTab(tab.id)}
              >
                <Ionicons
                  name={tab.icon}
                  size={16}
                  color={isActive ? colors.textPrimary : colors.textSecondary}
                  style={styles.tabIcon}
                />
                <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.content}>{renderActiveTab()}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    paddingHorizontal: adminTokens.spacing.pageX,
    paddingBottom: adminTokens.spacing.gapMd,
  },
  tabScrollContent: {
    paddingRight: adminTokens.spacing.pageX,
    gap: adminTokens.spacing.gapSm,
  },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: adminTokens.spacing.gapMd,
    paddingVertical: adminTokens.spacing.gapSm,
    borderRadius: adminTokens.radius.chip,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tabButtonActive: {
    backgroundColor: colors.accentPrimarySubtle,
    borderColor: colors.accentPrimary,
  },
  tabIcon: {
    marginRight: 6,
  },
  tabText: {
    ...adminTokens.typography.caption,
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.textPrimary,
    ...adminTokens.typography.caption,
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
});
