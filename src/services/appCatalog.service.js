const APP_CATALOG = [
  {
    id: 'excel',
    appName: 'Excel',
    label: 'Excel',
    category: 'productivity',
    description: 'Analyze spreadsheet data and export reports.',
  },
  {
    id: 'google-drive',
    appName: 'GoogleDrive',
    label: 'Google Drive',
    category: 'storage',
    description: 'Find, read, and organize Drive files.',
  },
  {
    id: 'microsoft-word',
    appName: 'MicrosoftWord',
    label: 'Microsoft Word',
    category: 'documents',
    description: 'Create and review structured documents.',
  },
  {
    id: 'slides',
    appName: 'Slides',
    label: 'Slides',
    category: 'presentations',
    description: 'Prepare presentation drafts and summaries.',
  },
  {
    id: 'gmail',
    appName: 'Gmail',
    label: 'Gmail',
    category: 'email',
    description: 'Search mailbox context and draft replies.',
  },
  {
    id: 'slack',
    appName: 'Slack',
    label: 'Slack',
    category: 'messaging',
    description: 'Send workspace alerts and workflow updates.',
  },
  {
    id: 'teams',
    appName: 'Teams',
    label: 'Teams',
    category: 'messaging',
    description: 'Route approvals and reminders to Teams.',
  },
  {
    id: 'webhook',
    appName: 'Webhook',
    label: 'Webhook',
    category: 'developer',
    description: 'Connect Saby events to any external endpoint.',
  },
];

const getAppCatalog = () => APP_CATALOG;
const getAllowedAppNames = () => APP_CATALOG.map((app) => app.appName);

module.exports = {
  APP_CATALOG,
  getAppCatalog,
  getAllowedAppNames,
};
