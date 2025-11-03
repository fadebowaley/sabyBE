const express = require('express');
const apiKeyRoute = require('./apiKey.route');
const apiKeyApprovalRoute = require('./apiKeyApproval.route');
const appRoute = require('./app.route');
const authRoute = require('./auth.route');
const dataRoute = require('./data.route');
const docsRoute = require('./docs.route');
const levelRoute = require('./level.route');
const nodeRoute = require('./node.route');
// const nodeProfileRoute = require('./nodeprofile.route'); // ✅ DELETED: Merged into node.route
const paymentRoute = require('./payment.route');
const permissionRoute = require('./permission.route');
const projectFormRoute = require('./projectForm.route');
const projectFormSubmissionRoute = require('./projectFormSubmission.route');
const roleRoute = require('./role.route');
const structureRoute = require('./structure.route');
const userRoute = require('./user.route');
const userFormSettingsRoute = require('./userFormSettings.route');
// const userProfileRoute = require('./userProfile.route'); // ✅ DELETED: Merged into user.route
const adminRoute = require('./admin.route');
const captureRoute = require('./capture.route');
const departmentRoute = require('./department.route');
const eventRoute = require('./event.route');
const eventConfigRoute = require('./eventConfig.route');
const programRoute = require('./program.route');
const reportRoute = require('./report.route');
const settingsRoute = require('./settings.route');
const statementRoute = require('./statement.route');
const collectionRoute = require('./collection.route');
const inmailRoute = require('./inmail.route');
const postgresRoute = require('./postgres.route');
const storageRoute = require('./storage.route');
const storageFolderRoute = require('./storageFolder.route');
const submissionRoute = require('./submission.route');
const telegramWebAppRoute = require('./telegramWebApp.route');
const waitlistRoute = require('./waitlist.route');
// Reporting & Analytics Routes
const submissionReportRoute = require('./submissionReport.route');
const complianceReportRoute = require('./complianceReport.route');
const validationReportRoute = require('./validationReport.route');
const notificationReportRoute = require('./notificationReport.route');
const analyticsReportRoute = require('./analyticsReport.route');
const exportReportRoute = require('./exportReport.route');
const trendAnalysisRoute = require('./trendAnalysis.route');
// PERM Routes
const unifiedSubmissionRoute = require('./unifiedSubmission.route');
const eventCalendarRoute = require('./eventCalendar.route');
const eventComplianceRoute = require('./eventCompliance.route');
const permSubmissionRoute = require('./permSubmission.route');

// declare rest of the routes: nodeLevel, nodeStructure, node etc.
const config = require('../../config/config');

const router = express.Router();

// Routes that are always available
const defaultRoutes = [
  {
    path: '/api-keys', // Example: /api-keys, /api-keys/123
    route: apiKeyRoute,
  },
  {
    path: '/api-key-approvals', // Example: /api-key-approvals/pending
    route: apiKeyApprovalRoute,
  },
  {
    path: '/api-submit',
    route: submissionRoute,
  },
  {
    path: '/auth', // Example: /auth/login, /auth/register
    route: authRoute,
  },
  {
    path: '/users', // Example: /users/123, /users/profile
    route: userRoute,
  },
  {
    path: '/user-form-settings', // Example: /user-form-settings/user/123
    route: userFormSettingsRoute,
  },
  // ✅ DELETED: UserProfile merged into User model
  // {
  //   path: '/user-profiles',
  //   route: userProfileRoute,
  // },
  {
    path: '/project-forms', // Example: /project-forms/123, /project-forms/project/abc123
    route: projectFormRoute,
  },
  {
    path: '/form-submissions', // Example: /form-submissions/123, /form-submissions/project/abc123
    route: projectFormSubmissionRoute,
  },
  {
    path: '/roles', // Example: /roles/123, /roles/info
    route: roleRoute,
  },
  {
    path: '/permissions', // Example: /permissions/123, /permissions/info
    route: permissionRoute,
  },
  {
    path: '/data', // Example: /data/123, /data/info
    route: dataRoute,
  },
  {
    path: '/app', // Example: /app/123, /app/info
    route: appRoute,
  },
  {
    path: '/level', // Example: /level/123, /level/info
    route: levelRoute,
  },
  {
    path: '/payment', // Example: /payment/123, /payment/info
    route: paymentRoute,
  },
  {
    path: '/structure', // Example: /structure/123, /structure/info
    route: structureRoute,
  },
  {
    path: '/node', // Example: /node/123, /node/info
    route: nodeRoute,
  },
  // ✅ DELETED: NodeProfile merged into Node model
  // {
  //   path: '/nodeprofile',
  //   route: nodeProfileRoute,
  // },
  {
    path: '/admin', // Example: /admin/123, /admin/info
    route: adminRoute,
  },
  {
    path: '/capture', // Example: /capture/123, /capture/info
    route: captureRoute,
  },
  {
    path: '/department', // Example: /department/123, /department/info
    route: departmentRoute,
  },
  {
    path: '/event', // Example: /event/123, /event/info
    route: eventRoute,
  },
  {
    path: '/eventConfig', // Example: /eventConfig/123, /eventConfig/info
    route: eventConfigRoute,
  },
  {
    path: '/program', // Example: /program/123, /program/info
    route: programRoute,
  },
  {
    path: '/report', // Example: /report/123, /report/info
    route: reportRoute,
  },
  {
    path: '/settings', // Example: /settings/123, /settings/info
    route: settingsRoute,
  },
  {
    path: '/statement', // Example: /statement/123, /statement/info
    route: statementRoute,
  },
  {
    path: '/collections',
    route: collectionRoute,
  },
  {
    path: '/inmail',
    route: inmailRoute,
  },
  {
    path: '/postgres',
    route: postgresRoute,
  },
  {
    path: '/storage/folders',
    route: storageFolderRoute,
  },
  {
    path: '/storage',
    route: storageRoute,
  },
  {
    path: '/telegram',
    route: telegramWebAppRoute,
  },
  {
    path: '/waitlist',
    route: waitlistRoute,
  },
  // Unified Submission & PERM Routes
  {
    path: '/submissions',
    route: unifiedSubmissionRoute,
  },
  // {
  //   path: '/perm/submissions',
  //   route: permSubmissionRoute,
  // },
  {
    path: '/event-calendar',
    route: eventCalendarRoute,
  },
  // {
  //   path: '/event-compliance',
  //   route: eventComplianceRoute,
  // },
  // Reporting Routes
  {
    path: '/submission-reports',
    route: submissionReportRoute,
  },
  // {
  //   path: '/compliance-reports',
  //   route: complianceReportRoute,
  // },
  {
    path: '/validation-reports',
    route: validationReportRoute,
  },
  // {
  //   path: '/notification-reports',
  //   route: notificationReportRoute,
  // },
  {
    path: '/analytics',
    route: analyticsReportRoute,
  },
  {
    path: '/export',
    route: exportReportRoute,
  },
  {
    path: '/trend-analysis',
    route: trendAnalysisRoute,
  },
];

// Routes only available during development
const devRoutes = [
  // routes available only in development mode
  {
    path: '/docs', // Example: /docs shows API documentation
    route: docsRoute,
  },
];

// Set up all the regular routes
defaultRoutes.forEach((route) => {
  router.use(route.path, route.route);
});

// Set up development routes only if we're in development mode
/* istanbul ignore next */
if (config.env === 'development') {
  devRoutes.forEach((route) => {
    router.use(route.path, route.route);
  });
}

router.use('/admin', adminRoute);
router.use('/captures', captureRoute);
router.use('/collections', collectionRoute);
router.use('/departments', departmentRoute);
router.use('/submitData', submissionRoute);

module.exports = router;
