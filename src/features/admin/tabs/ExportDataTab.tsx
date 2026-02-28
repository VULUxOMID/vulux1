import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useAdminAuth } from '../hooks/useAdminAuth';
import { useAdminBackend } from '../hooks/useAdminBackend';
import {
  ActionCard,
  AdminActionBanner,
  AdminBadge,
  AdminButton,
  AdminSectionHeader,
  AdminStatusChip,
  AdminTextInput,
  ReadOnlyCard,
} from '../ui/AdminLayout';
import { adminTokens } from '../ui/adminTokens';
import { getPermissionLabel } from '../utils/permissions';

type ExportResourceType = 'audit_logs' | 'user_reports' | 'moderation_actions';
type ExportFormat = 'csv' | 'json';
type ExportStatus = 'queued' | 'processing' | 'completed' | 'failed';
type ExportFilterKey = 'actionType' | 'targetId' | 'status' | 'reportedUserId';

type AdminExportRecord = {
  id: string;
  resourceType: ExportResourceType;
  exportFormat: ExportFormat;
  status: ExportStatus;
  progress: number;
  estimatedCount: number;
  rowCount: number | null;
  filters: Record<string, string>;
  errorMessage: string | null;
  downloadUrl: string | null;
};

type ExportEstimateResponse = {
  ok: boolean;
  estimatedCount: number;
};

type ExportResponse = {
  ok: boolean;
  export: AdminExportRecord;
};

const EXPORT_RESOURCE_OPTIONS: Array<{
  id: ExportResourceType;
  label: string;
  description: string;
}> = [
  {
    id: 'audit_logs',
    label: 'Audit logs',
    description: 'Admin request history with actor, target, result, and metadata.',
  },
  {
    id: 'user_reports',
    label: 'User reports',
    description: 'Escalated moderation reports and linked support tickets.',
  },
  {
    id: 'moderation_actions',
    label: 'Moderation actions',
    description: 'Durable user, message, and report actions taken by staff.',
  },
];

const EXPORT_FORMAT_OPTIONS: Array<{ id: ExportFormat; label: string }> = [
  { id: 'csv', label: 'CSV' },
  { id: 'json', label: 'JSON' },
];

const EXPORT_FILTER_FIELDS: Record<
  ExportResourceType,
  Array<{ key: ExportFilterKey; label: string; placeholder: string }>
> = {
  audit_logs: [
    { key: 'actionType', label: 'Action type', placeholder: 'EXPORT_DATA' },
    { key: 'targetId', label: 'Target ID', placeholder: 'user_123 or export id' },
  ],
  user_reports: [
    { key: 'status', label: 'Report status', placeholder: 'escalated' },
    { key: 'reportedUserId', label: 'Reported user', placeholder: 'user_123' },
  ],
  moderation_actions: [
    { key: 'actionType', label: 'Action type', placeholder: 'ban, delete, escalate' },
    { key: 'targetId', label: 'Target ID', placeholder: 'user_123 or message id' },
  ],
};

function getExportTone(status: ExportStatus) {
  if (status === 'completed') return 'success';
  if (status === 'failed') return 'danger';
  if (status === 'processing') return 'warning';
  return 'primary';
}

function buildExportFilters(
  resourceType: ExportResourceType,
  rawFilters: Record<string, string>,
) {
  const filters: Record<string, string> = {};
  const startDate = rawFilters.startDate?.trim();
  const endDate = rawFilters.endDate?.trim();

  if (startDate) {
    filters.startDate = startDate;
  }
  if (endDate) {
    filters.endDate = endDate;
  }

  EXPORT_FILTER_FIELDS[resourceType].forEach((field) => {
    const value = rawFilters[field.key]?.trim();
    if (value) {
      filters[field.key] = value;
    }
  });

  return filters;
}

function describeExportFilters(filters: Record<string, string>) {
  const entries = Object.entries(filters);
  if (entries.length === 0) {
    return 'No filters applied.';
  }

  return entries.map(([key, value]) => `${key}: ${value}`).join(' • ');
}

function getExportStatusMessage(exportRecord: AdminExportRecord) {
  if (exportRecord.status === 'completed') {
    return `${exportRecord.rowCount ?? 0} rows ready.`;
  }
  if (exportRecord.status === 'failed') {
    return exportRecord.errorMessage || 'Export failed.';
  }

  return `Progress ${exportRecord.progress}%`;
}

export function ExportDataTab() {
  const { canPerform } = useAdminAuth();
  const { get, post, isConnected } = useAdminBackend();
  const canExportData = canPerform('EXPORT_DATA');

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [resourceType, setResourceType] = useState<ExportResourceType>('audit_logs');
  const [exportFormat, setExportFormat] = useState<ExportFormat>('csv');
  const [filters, setFilters] = useState<Record<string, string>>({
    startDate: '',
    endDate: '',
    actionType: '',
    targetId: '',
    status: '',
    reportedUserId: '',
  });
  const [estimatedCount, setEstimatedCount] = useState<number | null>(null);
  const [isEstimating, setIsEstimating] = useState(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [currentExport, setCurrentExport] = useState<AdminExportRecord | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentFilterFields = EXPORT_FILTER_FIELDS[resourceType];
  const requestFilters = useMemo(
    () => buildExportFilters(resourceType, filters),
    [filters, resourceType],
  );

  useEffect(() => {
    if (!isModalVisible || !canExportData) {
      return;
    }

    let cancelled = false;
    setIsEstimating(true);
    setEstimateError(null);

    const timeoutId = setTimeout(() => {
      void (async () => {
        try {
          const response = await post<ExportEstimateResponse>('/admin/exports/estimate', {
            resourceType,
            filters: requestFilters,
          });
          if (!cancelled) {
            setEstimatedCount(response.estimatedCount);
          }
        } catch (nextError) {
          if (!cancelled) {
            setEstimatedCount(null);
            setEstimateError(
              nextError instanceof Error ? nextError.message : 'Unable to estimate export size.',
            );
          }
        } finally {
          if (!cancelled) {
            setIsEstimating(false);
          }
        }
      })();
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [canExportData, isModalVisible, post, requestFilters, resourceType]);

  useEffect(() => {
    if (!currentExport || (currentExport.status !== 'queued' && currentExport.status !== 'processing')) {
      return;
    }

    let cancelled = false;
    const intervalId = setInterval(() => {
      void (async () => {
        try {
          const response = await get<ExportResponse>(`/admin/exports/${currentExport.id}`);
          if (!cancelled) {
            setCurrentExport(response.export);
          }
        } catch {
          // Keep the last known state and try again.
        }
      })();
    }, 1500);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [currentExport, get]);

  const updateFilter = (key: string, value: string) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
    }));
    setError(null);
    setMessage(null);
  };

  const startExport = async () => {
    if (!canExportData || isCreating) {
      return;
    }

    setIsCreating(true);
    setError(null);
    setMessage(null);

    try {
      const response = await post<ExportResponse>('/admin/exports', {
        resourceType,
        exportFormat,
        filters: requestFilters,
      });
      setCurrentExport(response.export);
      setMessage('Export started. Progress will update until the file is ready.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to start export.');
    } finally {
      setIsCreating(false);
    }
  };

  const openExportFile = async () => {
    const downloadUrl = currentExport?.downloadUrl;
    if (!downloadUrl) {
      return;
    }

    try {
      await Linking.openURL(downloadUrl);
      setMessage('Export link opened.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to open export link.');
    }
  };

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <AdminSectionHeader
          title="Data exports"
          description="Export audit logs, user reports, and moderation actions after filters are applied."
        />

        <ReadOnlyCard
          title="Export policy"
          subtitle="Filters are applied before export, and every export request is written to audit logs."
          footer={
            <View style={styles.metaRow}>
              <AdminStatusChip label="backend export jobs" tone="success" />
              <AdminBadge label={isConnected ? 'backend connected' : 'backend offline'} tone={isConnected ? 'primary' : 'danger'} />
            </View>
          }
        />

        <ActionCard
          title="Create export"
          subtitle="Open the modal to choose the dataset, refine filters, and confirm CSV or JSON output."
          tone="primary"
        >
          <AdminButton
            label="Open export modal"
            tone="primary"
            disabled={!canExportData}
            disabledReason={!canExportData ? getPermissionLabel('EXPORT_DATA') : undefined}
            onPress={() => setIsModalVisible(true)}
          />

          {currentExport ? (
            <View style={styles.exportState}>
              <AdminActionBanner
                tone={getExportTone(currentExport.status)}
                message={`${currentExport.resourceType} • ${currentExport.exportFormat.toUpperCase()} • ${getExportStatusMessage(currentExport)}`}
              />
              {currentExport.status === 'completed' && currentExport.downloadUrl ? (
                <AdminButton
                  label="Open export file"
                  tone="success"
                  onPress={() => {
                    void openExportFile();
                  }}
                />
              ) : null}
            </View>
          ) : null}

          {message ? <AdminActionBanner tone="success" message={message} /> : null}
          {error ? <AdminActionBanner tone="danger" message={error} /> : null}
        </ActionCard>

        <ReadOnlyCard
          title="Supported datasets"
          subtitle="Exports are generated server-side and include the currently selected filters."
        >
          <View style={styles.optionList}>
            {EXPORT_RESOURCE_OPTIONS.map((option) => (
              <View key={option.id} style={styles.datasetItem}>
                <Text style={styles.datasetTitle}>{option.label}</Text>
                <Text style={styles.datasetDescription}>{option.description}</Text>
              </View>
            ))}
          </View>
        </ReadOnlyCard>
      </ScrollView>

      <Modal
        visible={isModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ScrollView contentContainerStyle={styles.modalContent}>
              <Text style={styles.modalTitle}>Export data</Text>
              <Text style={styles.modalDescription}>
                Selected filters are applied before the export file is generated.
              </Text>

              <View style={styles.modalGroup}>
                <Text style={styles.fieldLabel}>Dataset</Text>
                <View style={styles.optionList}>
                  {EXPORT_RESOURCE_OPTIONS.map((option) => {
                    const isActive = option.id === resourceType;
                    return (
                      <Pressable
                        key={option.id}
                        onPress={() => setResourceType(option.id)}
                        style={[styles.optionCard, isActive ? styles.optionCardActive : null]}
                      >
                        <Text style={[styles.optionTitle, isActive ? styles.optionTitleActive : null]}>
                          {option.label}
                        </Text>
                        <Text style={styles.optionDescription}>{option.description}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.modalGroup}>
                <Text style={styles.fieldLabel}>Format</Text>
                <View style={styles.inlineRow}>
                  {EXPORT_FORMAT_OPTIONS.map((option) => {
                    const isActive = option.id === exportFormat;
                    return (
                      <Pressable
                        key={option.id}
                        onPress={() => setExportFormat(option.id)}
                        style={[styles.choiceChip, isActive ? styles.choiceChipActive : null]}
                      >
                        <Text style={[styles.choiceChipText, isActive ? styles.choiceChipTextActive : null]}>
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.modalGroup}>
                <Text style={styles.fieldLabel}>Common filters</Text>
                <View style={styles.inputGroup}>
                  <AdminTextInput
                    value={filters.startDate}
                    onChangeText={(value) => updateFilter('startDate', value)}
                    placeholder="Start date (ISO), e.g. 2026-02-01T00:00:00Z"
                  />
                  <AdminTextInput
                    value={filters.endDate}
                    onChangeText={(value) => updateFilter('endDate', value)}
                    placeholder="End date (ISO), e.g. 2026-02-27T23:59:59Z"
                  />
                </View>
              </View>

              <View style={styles.modalGroup}>
                <Text style={styles.fieldLabel}>Dataset filters</Text>
                <View style={styles.inputGroup}>
                  {currentFilterFields.map((field) => (
                    <View key={field.key} style={styles.inputField}>
                      <Text style={styles.fieldLabel}>{field.label}</Text>
                      <AdminTextInput
                        value={filters[field.key] || ''}
                        onChangeText={(value) => updateFilter(field.key, value)}
                        placeholder={field.placeholder}
                      />
                    </View>
                  ))}
                </View>
              </View>

              <ReadOnlyCard
                title="Selection preview"
                subtitle={`${resourceType.replace(/_/g, ' ')} • ${exportFormat.toUpperCase()}`}
                footer={
                  <View style={styles.metaRow}>
                    {isEstimating ? (
                      <View style={styles.estimateRow}>
                        <ActivityIndicator size="small" color={adminTokens.colors.primary} />
                        <Text style={styles.helperText}>Estimating…</Text>
                      </View>
                    ) : (
                      <AdminBadge
                        label={estimatedCount == null ? 'Estimate unavailable' : `${estimatedCount} records`}
                        tone={estimatedCount == null ? 'warning' : 'primary'}
                      />
                    )}
                  </View>
                }
              >
                <Text style={styles.helperText}>{describeExportFilters(requestFilters)}</Text>
              </ReadOnlyCard>

              {estimateError ? <AdminActionBanner tone="danger" message={estimateError} /> : null}
              {error ? <AdminActionBanner tone="danger" message={error} /> : null}
              {message ? <AdminActionBanner tone="success" message={message} /> : null}

              {currentExport ? (
                <ActionCard
                  title="Current export"
                  subtitle={`${currentExport.resourceType} • ${currentExport.exportFormat.toUpperCase()}`}
                  tone={getExportTone(currentExport.status)}
                >
                  <Text style={styles.helperText}>{getExportStatusMessage(currentExport)}</Text>
                  {currentExport.status === 'completed' && currentExport.downloadUrl ? (
                    <AdminButton
                      label="Open export file"
                      tone="success"
                      onPress={() => {
                        void openExportFile();
                      }}
                    />
                  ) : null}
                </ActionCard>
              ) : null}
            </ScrollView>

            <View style={styles.modalActions}>
              <Pressable onPress={() => setIsModalVisible(false)} style={styles.closeButton}>
                <Text style={styles.closeButtonText}>Close</Text>
              </Pressable>
              <AdminButton
                label="Start export"
                tone="primary"
                disabled={!canExportData || isEstimating}
                disabledReason={!canExportData ? getPermissionLabel('EXPORT_DATA') : undefined}
                loading={isCreating}
                onPress={() => {
                  void startExport();
                }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: adminTokens.spacing.pageX,
    paddingTop: adminTokens.spacing.gapMd,
    paddingBottom: 140,
    gap: adminTokens.spacing.gapMd,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: adminTokens.spacing.gapSm,
  },
  exportState: {
    gap: adminTokens.spacing.gapSm,
  },
  optionList: {
    gap: adminTokens.spacing.gapSm,
  },
  datasetItem: {
    gap: 4,
    padding: adminTokens.spacing.gapSm,
    borderWidth: adminTokens.border.width,
    borderColor: adminTokens.colors.border,
    borderRadius: adminTokens.radius.input,
    backgroundColor: adminTokens.colors.surfaceAlt,
  },
  datasetTitle: {
    ...adminTokens.typography.caption,
    color: adminTokens.colors.textPrimary,
  },
  datasetDescription: {
    ...adminTokens.typography.caption,
    color: adminTokens.colors.textSecondary,
  },
  helperText: {
    ...adminTokens.typography.caption,
    color: adminTokens.colors.textSecondary,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    padding: adminTokens.spacing.pageX,
    backgroundColor: adminTokens.colors.overlayScrim,
  },
  modalCard: {
    maxHeight: '92%',
    borderWidth: adminTokens.border.width,
    borderColor: adminTokens.colors.border,
    borderRadius: adminTokens.radius.card,
    backgroundColor: adminTokens.colors.surface,
    padding: adminTokens.spacing.card,
    gap: adminTokens.spacing.gapMd,
  },
  modalContent: {
    gap: adminTokens.spacing.gapMd,
  },
  modalTitle: {
    ...adminTokens.typography.cardTitle,
    color: adminTokens.colors.textPrimary,
  },
  modalDescription: {
    ...adminTokens.typography.body,
    color: adminTokens.colors.textSecondary,
  },
  modalGroup: {
    gap: adminTokens.spacing.gapSm,
  },
  optionCard: {
    gap: 4,
    padding: adminTokens.spacing.gapMd,
    borderWidth: adminTokens.border.width,
    borderColor: adminTokens.colors.border,
    borderRadius: adminTokens.radius.input,
    backgroundColor: adminTokens.colors.surfaceAlt,
  },
  optionCardActive: {
    borderColor: adminTokens.colors.accentPrimary,
    backgroundColor: adminTokens.colors.accentPrimarySubtle,
  },
  optionTitle: {
    ...adminTokens.typography.caption,
    color: adminTokens.colors.textPrimary,
  },
  optionTitleActive: {
    color: adminTokens.colors.accentPrimary,
  },
  optionDescription: {
    ...adminTokens.typography.caption,
    color: adminTokens.colors.textSecondary,
  },
  inlineRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: adminTokens.spacing.gapSm,
  },
  choiceChip: {
    paddingHorizontal: adminTokens.spacing.gapMd,
    paddingVertical: adminTokens.spacing.gapSm,
    borderWidth: adminTokens.border.width,
    borderColor: adminTokens.colors.border,
    borderRadius: adminTokens.radius.chip,
    backgroundColor: adminTokens.colors.surfaceAlt,
  },
  choiceChipActive: {
    borderColor: adminTokens.colors.accentPrimary,
    backgroundColor: adminTokens.colors.accentPrimarySubtle,
  },
  choiceChipText: {
    ...adminTokens.typography.caption,
    color: adminTokens.colors.textSecondary,
  },
  choiceChipTextActive: {
    color: adminTokens.colors.accentPrimary,
  },
  inputGroup: {
    gap: adminTokens.spacing.gapSm,
  },
  inputField: {
    gap: 6,
  },
  fieldLabel: {
    ...adminTokens.typography.caption,
    color: adminTokens.colors.textSecondary,
  },
  estimateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: adminTokens.spacing.gapSm,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: adminTokens.spacing.gapSm,
  },
  closeButton: {
    paddingHorizontal: adminTokens.spacing.gapMd,
    paddingVertical: adminTokens.spacing.gapSm,
  },
  closeButtonText: {
    ...adminTokens.typography.caption,
    color: adminTokens.colors.textSecondary,
  },
});
