/**
 * Export Report Controller
 *
 * HTTP endpoints for data export functionality.
 * Handles CSV, JSON, and Excel export operations for all reporting data.
 *
 * @module controllers/exportReport
 */

const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const exportReportService = require('../services/exportReport.service');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const workspaceProjectAccessService = require('../services/workspaceProjectAccess.service');

const canBypassWorkspaceScope = (req) =>
  Boolean(req.user?.isSuper) || Boolean(req.user?.isSaby);

const applyWorkspaceProjectScope = async (req, filters) => {
  if (req.user?.tenantId) {
    if (
      filters.tenant_id &&
      !canBypassWorkspaceScope(req) &&
      String(filters.tenant_id) !== String(req.user.tenantId)
    ) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        'Cannot export data for another tenant'
      );
    }

    filters.tenant_id = filters.tenant_id || req.user.tenantId;
  }

  const accessibleProjectIds =
    await workspaceProjectAccessService.getAccessibleProjectIds({
      tenantId: filters.tenant_id || req.user?.tenantId || null,
      user: req.user,
    });

  if (!Array.isArray(accessibleProjectIds)) {
    return filters;
  }

  if (filters.project_id) {
    if (!accessibleProjectIds.includes(String(filters.project_id))) {
      filters.project_ids = [];
      delete filters.project_id;
    }
    return filters;
  }

  filters.project_ids = accessibleProjectIds;
  return filters;
};

/**
 * GET /v1/export/submissions/csv
 * Export submissions data to CSV format
 */
const exportSubmissionsCSV = catchAsync(async (req, res) => {
  const filters = pick(req.query, [
    'tenant_id',
    'project_id',
    'status',
    'month',
    'year',
    'node_id',
    'user_id',
    'perm_enabled',
    'limit',
    'offset',
  ]);

  await applyWorkspaceProjectScope(req, filters);

  const data = await exportReportService.exportSubmissionsCSV(filters);
  const stats = await exportReportService.getExportStats({
    ...filters,
    data_type: 'submissions',
  });

  // Set CSV headers
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="submissions_export_${
      new Date().toISOString().split('T')[0]
    }.csv"`
  );

  const headers = [
    'id',
    'tenant_id',
    'project_id',
    'form_id',
    'node_id',
    'user_id',
    'status',
    'data',
    'meta',
    'perm_enabled',
    'month',
    'event_compliance_percentage',
    'completeness_status',
    'is_locked',
    'validation_status',
    'created_at',
    'updated_at',
  ];

  const csvContent = exportReportService.generateCSV(data, headers);
  res.send(csvContent);
});

/**
 * GET /v1/export/submissions/json
 * Export submissions data to JSON format
 */
const exportSubmissionsJSON = catchAsync(async (req, res) => {
  const filters = pick(req.query, [
    'tenant_id',
    'project_id',
    'status',
    'month',
    'year',
    'node_id',
    'user_id',
    'perm_enabled',
    'limit',
    'offset',
  ]);

  await applyWorkspaceProjectScope(req, filters);

  const data = await exportReportService.exportSubmissionsJSON(filters);
  const stats = await exportReportService.getExportStats({
    ...filters,
    data_type: 'submissions',
  });

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Submissions exported successfully',
    data: {
      records: data,
      stats,
      export_info: {
        format: 'JSON',
        total_records: data.length,
        exported_at: new Date().toISOString(),
        filters_applied: filters,
      },
    },
  });
});

/**
 * GET /v1/export/compliance/csv
 * Export compliance data to CSV format
 */
const exportComplianceCSV = catchAsync(async (req, res) => {
  const filters = pick(req.query, [
    'tenant_id',
    'project_id',
    'node_id',
    'month',
    'year',
    'compliance_status',
    'limit',
    'offset',
  ]);

  const data = await exportReportService.exportComplianceCSV(filters);
  const stats = await exportReportService.getExportStats({
    ...filters,
    data_type: 'compliance',
  });

  // Set CSV headers
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="compliance_export_${
      new Date().toISOString().split('T')[0]
    }.csv"`
  );

  const headers = [
    'id',
    'tenant_id',
    'project_id',
    'node_id',
    'month',
    'completeness_percentage',
    'compliance_status',
    'total_events_submitted',
    'events_breakdown',
    'created_at',
    'updated_at',
  ];

  const csvContent = exportReportService.generateCSV(data, headers);
  res.send(csvContent);
});

/**
 * GET /v1/export/compliance/json
 * Export compliance data to JSON format
 */
const exportComplianceJSON = catchAsync(async (req, res) => {
  const filters = pick(req.query, [
    'tenant_id',
    'project_id',
    'node_id',
    'month',
    'year',
    'compliance_status',
    'limit',
    'offset',
  ]);

  const data = await exportReportService.exportComplianceJSON(filters);
  const stats = await exportReportService.getExportStats({
    ...filters,
    data_type: 'compliance',
  });

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Compliance data exported successfully',
    data: {
      records: data,
      stats,
      export_info: {
        format: 'JSON',
        total_records: data.length,
        exported_at: new Date().toISOString(),
        filters_applied: filters,
      },
    },
  });
});

/**
 * GET /v1/export/validations/csv
 * Export validation data to CSV format
 */
const exportValidationsCSV = catchAsync(async (req, res) => {
  const filters = pick(req.query, [
    'tenant_id',
    'project_id',
    'submission_id',
    'validation_type',
    'status',
    'limit',
    'offset',
  ]);

  const data = await exportReportService.exportValidationsCSV(filters);
  const stats = await exportReportService.getExportStats({
    ...filters,
    data_type: 'validations',
  });

  // Set CSV headers
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="validations_export_${
      new Date().toISOString().split('T')[0]
    }.csv"`
  );

  const headers = [
    'id',
    'submission_id',
    'category',
    'validation_type',
    'is_valid',
    'severity',
    'error_code',
    'error_message',
    'error_details',
    'validated_field',
    'expected_value',
    'actual_value',
    'validation_metadata',
    'validated_at',
    'validated_by',
    'validation_version',
    'tenant_id',
    'project_id',
  ];

  const csvContent = exportReportService.generateCSV(data, headers);
  res.send(csvContent);
});

/**
 * GET /v1/export/validations/json
 * Export validation data to JSON format
 */
const exportValidationsJSON = catchAsync(async (req, res) => {
  const filters = pick(req.query, [
    'tenant_id',
    'project_id',
    'submission_id',
    'validation_type',
    'status',
    'limit',
    'offset',
  ]);

  const data = await exportReportService.exportValidationsJSON(filters);
  const stats = await exportReportService.getExportStats({
    ...filters,
    data_type: 'validations',
  });

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Validation data exported successfully',
    data: {
      records: data,
      stats,
      export_info: {
        format: 'JSON',
        total_records: data.length,
        exported_at: new Date().toISOString(),
        filters_applied: filters,
      },
    },
  });
});

/**
 * GET /v1/export/notifications/csv
 * Export notification data to CSV format
 */
const exportNotificationsCSV = catchAsync(async (req, res) => {
  const filters = pick(req.query, [
    'tenant_id',
    'project_id',
    'notification_type',
    'status',
    'priority',
    'limit',
    'offset',
  ]);

  const data = await exportReportService.exportNotificationsCSV(filters);
  const stats = await exportReportService.getExportStats({
    ...filters,
    data_type: 'notifications',
  });

  // Set CSV headers
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="notifications_export_${
      new Date().toISOString().split('T')[0]
    }.csv"`
  );

  const headers = [
    'id',
    'tenant_id',
    'project_id',
    'notification_type',
    'recipient_email',
    'subject',
    'message',
    'status',
    'priority',
    'scheduled_for',
    'sent_at',
    'retry_count',
    'created_at',
    'updated_at',
  ];

  const csvContent = exportReportService.generateCSV(data, headers);
  res.send(csvContent);
});

/**
 * GET /v1/export/notifications/json
 * Export notification data to JSON format
 */
const exportNotificationsJSON = catchAsync(async (req, res) => {
  const filters = pick(req.query, [
    'tenant_id',
    'project_id',
    'notification_type',
    'status',
    'priority',
    'limit',
    'offset',
  ]);

  const data = await exportReportService.exportNotificationsJSON(filters);
  const stats = await exportReportService.getExportStats({
    ...filters,
    data_type: 'notifications',
  });

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Notification data exported successfully',
    data: {
      records: data,
      stats,
      export_info: {
        format: 'JSON',
        total_records: data.length,
        exported_at: new Date().toISOString(),
        filters_applied: filters,
      },
    },
  });
});

/**
 * GET /v1/export/activity-logs/csv
 * Export activity log data to CSV format
 */
const exportActivityLogsCSV = catchAsync(async (req, res) => {
  const filters = pick(req.query, [
    'tenant_id',
    'project_id',
    'user_id',
    'action',
    'status',
    'limit',
    'offset',
  ]);

  const data = await exportReportService.exportActivityLogsCSV(filters);
  const stats = await exportReportService.getExportStats({
    ...filters,
    data_type: 'activity_logs',
  });

  // Set CSV headers
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="activity_logs_export_${
      new Date().toISOString().split('T')[0]
    }.csv"`
  );

  const headers = [
    'id',
    'tenant_id',
    'project_id',
    'project_name',
    'project_category',
    'form_id',
    'user_id',
    'action',
    'status',
    'job_id',
    'message',
    'created_at',
  ];

  const csvContent = exportReportService.generateCSV(data, headers);
  res.send(csvContent);
});

/**
 * GET /v1/export/activity-logs/json
 * Export activity log data to JSON format
 */
const exportActivityLogsJSON = catchAsync(async (req, res) => {
  const filters = pick(req.query, [
    'tenant_id',
    'project_id',
    'user_id',
    'action',
    'status',
    'limit',
    'offset',
  ]);

  const data = await exportReportService.exportActivityLogsJSON(filters);
  const stats = await exportReportService.getExportStats({
    ...filters,
    data_type: 'activity_logs',
  });

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Activity log data exported successfully',
    data: {
      records: data,
      stats,
      export_info: {
        format: 'JSON',
        total_records: data.length,
        exported_at: new Date().toISOString(),
        filters_applied: filters,
      },
    },
  });
});

/**
 * GET /v1/export/combined/csv
 * Export all data types to a single CSV file
 */
const exportCombinedCSV = catchAsync(async (req, res) => {
  const filters = pick(req.query, [
    'tenant_id',
    'project_id',
    'limit',
    'offset',
  ]);

  // Export all data types
  const [submissions, compliance, validations, notifications, activityLogs] =
    await Promise.all([
      exportReportService.exportSubmissionsCSV(filters),
      exportReportService.exportComplianceCSV(filters),
      exportReportService.exportValidationsCSV(filters),
      exportReportService.exportNotificationsCSV(filters),
      exportReportService.exportActivityLogsCSV(filters),
    ]);

  // Set CSV headers
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="combined_export_${
      new Date().toISOString().split('T')[0]
    }.csv"`
  );

  // Create combined CSV with sections
  let csvContent =
    'DATA_TYPE,ID,SUBMISSION_ID,TENANT_ID,PROJECT_ID,NODE_ID,USER_ID,STATUS,CREATED_AT\n';

  // Add submissions
  submissions.forEach((row) => {
    csvContent += `SUBMISSION,${row.id},${row.id},${row.tenant_id},${row.project_id},${row.node_id},${row.user_id},${row.status},${row.created_at}\n`;
  });

  // Add compliance
  compliance.forEach((row) => {
    csvContent += `COMPLIANCE,${row.id},,${row.tenant_id},${row.project_id},${row.node_id},,${row.compliance_status},${row.created_at}\n`;
  });

  // Add validations
  validations.forEach((row) => {
    csvContent += `VALIDATION,${row.id},${row.submission_id},${row.tenant_id},${row.project_id},,,${row.validation_status},${row.created_at}\n`;
  });

  // Add notifications
  notifications.forEach((row) => {
    csvContent += `NOTIFICATION,${row.id},,${row.tenant_id},${row.project_id},,,${row.status},${row.created_at}\n`;
  });

  // Add activity logs
  activityLogs.forEach((row) => {
    csvContent += `ACTIVITY_LOG,${row.id},,${row.tenant_id},${row.project_id},${row.node_id},${row.user_id},${row.status},${row.created_at}\n`;
  });

  res.send(csvContent);
});

/**
 * GET /v1/export/combined/json
 * Export all data types to a single JSON file
 */
const exportCombinedJSON = catchAsync(async (req, res) => {
  const filters = pick(req.query, [
    'tenant_id',
    'project_id',
    'limit',
    'offset',
  ]);

  // Export all data types
  const [submissions, compliance, validations, notifications, activityLogs] =
    await Promise.all([
      exportReportService.exportSubmissionsJSON(filters),
      exportReportService.exportComplianceJSON(filters),
      exportReportService.exportValidationsJSON(filters),
      exportReportService.exportNotificationsJSON(filters),
      exportReportService.exportActivityLogsJSON(filters),
    ]);

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Combined data exported successfully',
    data: {
      submissions,
      compliance,
      validations,
      notifications,
      activity_logs: activityLogs,
      export_info: {
        format: 'JSON',
        total_records:
          submissions.length +
          compliance.length +
          validations.length +
          notifications.length +
          activityLogs.length,
        exported_at: new Date().toISOString(),
        filters_applied: filters,
        breakdown: {
          submissions: submissions.length,
          compliance: compliance.length,
          validations: validations.length,
          notifications: notifications.length,
          activity_logs: activityLogs.length,
        },
      },
    },
  });
});

/**
 * GET /v1/export/stats
 * Get export statistics for all data types
 */
const getExportStats = catchAsync(async (req, res) => {
  const filters = pick(req.query, ['tenant_id', 'project_id']);

  const [
    submissionsStats,
    complianceStats,
    validationsStats,
    notificationsStats,
    activityLogsStats,
  ] = await Promise.all([
    exportReportService.getExportStats({
      ...filters,
      data_type: 'submissions',
    }),
    exportReportService.getExportStats({ ...filters, data_type: 'compliance' }),
    exportReportService.getExportStats({
      ...filters,
      data_type: 'validations',
    }),
    exportReportService.getExportStats({
      ...filters,
      data_type: 'notifications',
    }),
    exportReportService.getExportStats({
      ...filters,
      data_type: 'activity_logs',
    }),
  ]);

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Export statistics retrieved successfully',
    data: {
      submissions: submissionsStats,
      compliance: complianceStats,
      validations: validationsStats,
      notifications: notificationsStats,
      activity_logs: activityLogsStats,
      total_records:
        submissionsStats.total_records +
        complianceStats.total_records +
        validationsStats.total_records +
        notificationsStats.total_records +
        activityLogsStats.total_records,
      generated_at: new Date().toISOString(),
    },
  });
});

module.exports = {
  exportSubmissionsCSV,
  exportSubmissionsJSON,
  exportComplianceCSV,
  exportComplianceJSON,
  exportValidationsCSV,
  exportValidationsJSON,
  exportNotificationsCSV,
  exportNotificationsJSON,
  exportActivityLogsCSV,
  exportActivityLogsJSON,
  exportCombinedCSV,
  exportCombinedJSON,
  getExportStats,
};
