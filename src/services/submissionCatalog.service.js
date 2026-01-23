const { postgresPool } = require('../config/postgres');

const SubmissionCatalogService = {
  cache: new Map(),

  invalidate(projectId) {
    if (!projectId) return;
    this.cache.delete(projectId);
  },

  async getCatalogByProject(projectId) {
    if (!projectId) {
      return {};
    }

    if (this.cache.has(projectId)) {
      return this.cache.get(projectId);
    }

    try {
    const result = await postgresPool.query(
      `
        SELECT field_key, field_label, field_type, transformations, aliases
        FROM form_field_catalog
        WHERE project_id = $1
      `,
      [projectId]
    );

    const catalog = {};
    result.rows.forEach((row) => {
      const normaliseArray = (value) => {
        if (Array.isArray(value)) {
          return value;
        }
        if (value === null || value === undefined) {
          return [];
        }
        if (typeof value === 'string') {
          try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
          } catch (err) {
            return [];
          }
        }
        if (typeof value === 'object') {
          return Object.values(value).filter((item) => item != null);
        }
        return [];
      };

      catalog[row.field_key] = {
        field_label: row.field_label,
        field_type: row.field_type,
        transformations: normaliseArray(row.transformations),
        aliases: normaliseArray(row.aliases),
      };
    });

    this.cache.set(projectId, catalog);
    return catalog;
    } catch (error) {
      // Table doesn't exist or other error - return empty catalog
      // This allows submissions to proceed without catalog
      const logger = require('../config/logger');
      logger.warn(
        `[SubmissionCatalog] Table form_field_catalog not available for project ${projectId}: ${error.message}`
      );
      return {};
    }
  },
};

module.exports = SubmissionCatalogService;
