const { postgresPool } = require('../config/postgres');
const logger = require('../config/logger');

const SubmissionCatalogService = {
  cache: new Map(),
  tableAvailable: null,
  hasLoggedMissingTable: false,

  invalidate(projectId) {
    if (!projectId) return;
    this.cache.delete(projectId);
  },

  async isTableAvailable() {
    if (this.tableAvailable !== null) {
      return this.tableAvailable;
    }

    const result = await postgresPool.query(
      `SELECT to_regclass('public.form_field_catalog') AS table_name`
    );
    this.tableAvailable = Boolean(result.rows[0]?.table_name);
    return this.tableAvailable;
  },

  async getCatalogByProject(projectId) {
    if (!projectId) {
      return {};
    }

    if (this.cache.has(projectId)) {
      return this.cache.get(projectId);
    }

    try {
      const tableAvailable = await this.isTableAvailable();
      if (!tableAvailable) {
        if (!this.hasLoggedMissingTable) {
          logger.warn(
            '[SubmissionCatalog] Table form_field_catalog is missing; submission catalog lookups will be skipped until migrations run'
          );
          this.hasLoggedMissingTable = true;
        }
        return {};
      }

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
      if (error.code === '42P01') {
        this.tableAvailable = false;
        if (!this.hasLoggedMissingTable) {
          logger.warn(
            '[SubmissionCatalog] Table form_field_catalog is missing; submission catalog lookups will be skipped until migrations run'
          );
          this.hasLoggedMissingTable = true;
        }
        return {};
      }
      logger.warn(
        `[SubmissionCatalog] Failed to load catalog for project ${projectId}: ${error.message}`
      );
      return {};
    }
  },
};

module.exports = SubmissionCatalogService;
