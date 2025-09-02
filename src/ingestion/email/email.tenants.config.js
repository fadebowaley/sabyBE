// src/ingestion/email/email.tenants.config.js

/*
 * Tenant email ingestion configuration.
 * In production you should replace this in-memory list with database-backed
 * retrieval (e.g., MongoDB TenantEmailConfig collection).  We export helper
 * functions so the rest of the ingestion code remains unchanged when that
 * swap happens.
 */

const tenants = [
  {
    // Note: tenantId is no longer hardcoded - it's discovered dynamically from project forms
    tenantId: null, // Will be discovered from project form lookup
    email: process.env.DEMO_IMAP_USER || 'sendo@jmsfagribusiness.com',
    password: process.env.DEMO_IMAP_PASS || '@passwordA1',
    imapHost: process.env.DEMO_IMAP_HOST || 'mail.jmsfagribusiness.com',
    defaultProjectId: process.env.DEMO_PROJECT_ID || 'proj_1VOA1DzFtUf2',
    defaultFormId: process.env.DEMO_FORM_ID || null,
    defaultNodeId: process.env.DEMO_NODE_ID || null,
    projectName: 'Test Email Form',
    projectCategory: 'General',
    // Note: Authorization is now handled dynamically by the email validation service
    // which checks if the sender is a registered user in the database
    authorizedSenders: [], // Deprecated - now handled by validation service
    emailIngestionEnabled: true,
  },
  // Add more tenants here or fetch from DB
];

/**
 * Fetch tenants that have email ingestion enabled.
 * @returns {Promise<Array>} tenant configs
 */
async function getTenantsWithEmailConfig() {
  // If you later migrate to DB, make this an async DB call
  return tenants.filter((t) => t.emailIngestionEnabled);
}

/**
 * Determine if the sender email is allowed for the tenant.
 * @param {string} tenantId
 * @param {string} email
 * @returns {Promise<boolean>} whether authorized
 */
async function isAuthorizedSender(tenantId, email) {
  const tenant = tenants.find((t) => t.tenantId === tenantId);
  if (!tenant) return false;
  return tenant.authorizedSenders.includes(email.toLowerCase());
}

module.exports = {
  getTenantsWithEmailConfig,
  isAuthorizedSender,
};
