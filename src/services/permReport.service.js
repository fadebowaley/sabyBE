const httpStatus = require('http-status');
const { postgresPool } = require('../config/postgres');
const ApiError = require('../utils/ApiError');

const buildFilters = (filters = {}) => {
  const {
    tenant_id,
    project_id,
    node_id,
    structure_name,
    level_name,
    search,
    start_date,
    end_date,
    month,
  } = filters;

  const conditions = [];
  const values = [];
  let index = 1;

  if (!tenant_id) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenant_id is required');
  }

  if (!project_id) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'project_id is required');
  }

  conditions.push(`tenant_id = $${index}`);
  values.push(tenant_id);
  index += 1;

  conditions.push(`project_id = $${index}`);
  values.push(project_id);
  index += 1;

  if (node_id) {
    conditions.push(`node_id = $${index}`);
    values.push(node_id);
    index += 1;
  }

  if (structure_name) {
    conditions.push(`structure_name = $${index}`);
    values.push(structure_name);
    index += 1;
  }

  if (level_name) {
    conditions.push(`level_name = $${index}`);
    values.push(level_name);
    index += 1;
  }

  if (month) {
    conditions.push(`month = $${index}`);
    values.push(month);
    index += 1;
  }

  if (start_date) {
    conditions.push(`created_at >= $${index}`);
    values.push(start_date);
    index += 1;
  }

  if (end_date) {
    conditions.push(`created_at <= $${index}`);
    values.push(end_date);
    index += 1;
  }

  if (search) {
    conditions.push(
      `(node_name ILIKE $${index} OR node_reference ILIKE $${index} OR structure_name ILIKE $${index} OR structured_map::text ILIKE $${index})`
    );
    values.push(`%${search}%`);
    index += 1;
  }

  const whereClause = conditions.length
    ? `WHERE ${conditions.join(' AND ')}`
    : '';
  return { whereClause, values };
};

const getPermReport = async (filters = {}) => {
  const limit = Number(filters.limit) > 0 ? Number(filters.limit) : 25;
  const offset = Number(filters.offset) >= 0 ? Number(filters.offset) : 0;

  const { whereClause, values } = buildFilters(filters);

  const summaryQuery = `
    SELECT
      COUNT(*)::bigint AS total,
      AVG(event_compliance_percentage)::float AS avg_compliance,
      SUM(CASE WHEN event_compliance_percentage >= 100 THEN 1 ELSE 0 END)::bigint AS complete_count,
      SUM(CASE WHEN event_compliance_percentage >= 40 AND event_compliance_percentage < 100 THEN 1 ELSE 0 END)::bigint AS partial_count,
      SUM(CASE WHEN event_compliance_percentage < 40 OR event_compliance_percentage IS NULL THEN 1 ELSE 0 END)::bigint AS incomplete_count,
      SUM(boolean_true_count)::bigint AS boolean_true_total,
      SUM(boolean_false_count)::bigint AS boolean_false_total
    FROM perm_submission_report_view
    ${whereClause}
  `;

  const summaryResult = await postgresPool.query(summaryQuery, values);
  const summaryRow = summaryResult.rows[0] || {};
  const total = Number(summaryRow.total || 0);

  const dataQuery = `
    SELECT
      submission_id,
      tenant_id,
      project_id,
      form_id,
      node_id,
      user_id,
      source,
      status,
      perm_enabled,
      event_compliance_percentage,
      numeric_total,
      numeric_average,
      boolean_true_count,
      boolean_false_count,
      fields_count,
      created_at,
      updated_at,
      month,
      year,
      node_code,
      node_name,
      node_reference,
      structure_name,
      level_name,
      parent_node_id,
      lineage_ids,
      lineage_codes,
      lineage_names,
      lineage_refs,
      depth,
      is_active,
      is_main,
      structured_fields,
      structured_map
    FROM perm_submission_report_view
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${values.length + 1}
    OFFSET $${values.length + 2}
  `;

  const dataValues = [...values, limit, offset];
  const dataResult = await postgresPool.query(dataQuery, dataValues);

  return {
    total,
    summary: {
      avg_compliance: Number(summaryRow.avg_compliance || 0),
      complete_count: Number(summaryRow.complete_count || 0),
      partial_count: Number(summaryRow.partial_count || 0),
      incomplete_count: Number(summaryRow.incomplete_count || 0),
      boolean_true_total: Number(summaryRow.boolean_true_total || 0),
      boolean_false_total: Number(summaryRow.boolean_false_total || 0),
    },
    results: dataResult.rows,
  };
};

module.exports = {
  getPermReport,
};


