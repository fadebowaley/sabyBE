const { postgresPool } = require('../config/postgres');
const { emitActivityUpdate } = require('../config/socket');
const logger = require('../config/logger');

/**
 * Get enriched data from submission payload or fallback to lookup
 * Priority: Use payload data first, fallback to DB lookup only if needed
 * @param {Object} submitterData - Submitter data from payload
 * @param {Object} ids - IDs for fallback lookup
 * @returns {Promise<Object>} Denormalized data
 */
const getEnrichedData = async (submitterData = {}, ids = {}) => {
  const enrichedData = {
    user_name: submitterData.user_name || null,
    user_email: submitterData.user_email || null,
    user_phone: submitterData.user_phone || null,
    node_reference: submitterData.node_reference || null,
    node_name: submitterData.node_name || null,
    form_reference: submitterData.form_reference || null,
  };

  // Only do DB lookups if data is not provided in payload
  try {
    // Fetch user data if not in payload
    if (!enrichedData.user_name && ids.user_id) {
      const User = require('../models/user.model');
      const user = await User.findById(ids.user_id)
        .select('firstname lastname email phoneNumber')
        .lean();
      
      if (user) {
        enrichedData.user_name = `${user.firstname} ${user.lastname}`.trim();
        enrichedData.user_email = enrichedData.user_email || user.email;
        enrichedData.user_phone = enrichedData.user_phone || user.phoneNumber;
      }
    }

    // Fetch node data if not in payload
    if (!enrichedData.node_name && ids.node_id) {
      const Node = require('../models/node.model');
      const node = await Node.findById(ids.node_id)
        .select('nodeId name')
        .lean();
      
      if (node) {
        enrichedData.node_reference = enrichedData.node_reference || node.nodeId;
        enrichedData.node_name = node.name;
      }
    }

    // Fetch form reference if not in payload
    if (!enrichedData.form_reference && ids.project_id) {
      const ProjectForm = require('../models/projectForm.model');
      const form = await ProjectForm.findOne({ projectId: ids.project_id })
        .select('formReference')
        .lean();
      
      if (form) {
        enrichedData.form_reference = form.formReference;
      }
    }
  } catch (error) {
    logger.error('[Activity] Error fetching enriched data:', error.message);
    // Continue with whatever data we have - don't fail the log
  }

  return enrichedData;
};

/**
 * Log submission activity and emit real-time updates
 * @param {Object} activityData - Activity details
 * @param {string} activityData.tenant_id - Tenant identifier
 * @param {string} activityData.project_id - Project identifier
 * @param {string} activityData.project_name - Project name
 * @param {string} activityData.project_category - Project category
 * @param {string} activityData.form_id - Form identifier
 * @param {string} activityData.node_id - Node identifier (optional)
 * @param {string} activityData.user_id - User identifier (optional)
 * @param {string} activityData.action - Action performed (queued, processing, success, failed, retried)
 * @param {string} activityData.status - Current status
 * @param {string} activityData.job_id - Job identifier
 * @param {string} activityData.message - Activity message
 * @param {string} activityData.source - Source of submission (api, web, whatsapp, etc.)
 * @param {string} activityData.user_name - User full name (from payload)
 * @param {string} activityData.user_email - User email (from payload)
 * @param {string} activityData.user_phone - User phone (from payload)
 * @param {string} activityData.node_name - Node name (from payload)
 * @param {string} activityData.node_reference - Node reference (from payload)
 * @param {string} activityData.form_reference - Form reference (from payload)
 * @returns {Promise<void>}
 */
const logActivity = async (activityData) => {
  const {
    tenant_id,
    project_id,
    project_name,
    project_category,
    form_id,
    node_id,
    user_id,
    action,
    status,
    job_id,
    message,
    source = 'api',
    // Submitter Blueprint (preferred from payload)
    user_name,
    user_email,
    user_phone,
    node_name,
    node_reference,
    form_reference,
  } = activityData;

  try {
    // Get enriched data - prefer from payload, fallback to DB lookup
    const enrichedData = await getEnrichedData(
      {
        user_name,
        user_email,
        user_phone,
        node_name,
        node_reference,
        form_reference,
      },
      { user_id, node_id, project_id }
    );

    await postgresPool.query(
      `INSERT INTO submission_activity_log 
       (tenant_id, project_id, project_name, project_category, form_id, node_id, user_id, 
        action, status, job_id, message, source,
        user_name, user_email, user_phone, node_reference, node_name, form_reference)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
      [
        tenant_id,
        project_id,
        project_name,
        project_category,
        form_id,
        node_id,
        user_id,
        action,
        status,
        job_id,
        message,
        source,
        enrichedData.user_name,
        enrichedData.user_email,
        enrichedData.user_phone,
        enrichedData.node_reference,
        enrichedData.node_name,
        enrichedData.form_reference,
      ]
    );

    // Emit real-time update via Socket.IO
    if (tenant_id) {
      emitActivityUpdate(tenant_id, {
        ...activityData,
        ...enrichedData,
        timestamp: new Date().toISOString(),
      });
    }

    logger.info(
      `[Activity] ${action} - ${status} - Job: ${job_id} - ${
        enrichedData.user_name || 'Unknown'
      } - ${message}`
    );
  } catch (error) {
    logger.error('[Activity] Failed to log activity:', error);
    // Don't throw - logging failure shouldn't break submission
  }
};

module.exports = { logActivity };
