/* eslint-disable no-param-reassign */

const logger = require('../../config/logger');

const tenantPlugin = (schema) => {
  const debugEnabled = process.env.TENANT_PLUGIN_DEBUG === 'true';

  const debugLog = (...args) => {
    if (!debugEnabled) {
      return;
    }

    logger.debug(args.join(' '));
  };

  function applyTenantFilter(next) {
    debugLog('[TenantPlugin] Pre-hook triggered for:', this.op);
    debugLog('[TenantPlugin] Options:', JSON.stringify(this.options || {}));

    const user = this.options?.user;

    // SabyUser can see all users across all tenants
    if (user?.isSaby) {
      debugLog('[TenantPlugin] SabyUser detected - no tenant filtering applied');
      return next();
    }

    // SuperUser and Owner can only see users within their tenant
    if ((user?.isSuper || user?.isOwner) && !user?.isSaby) {
      debugLog('[TenantPlugin] Applying tenantId filter:', user.tenantId);
      this.setQuery({
        ...this.getQuery(),
        tenantId: user.tenantId,
      });
    }
    next();
  }

  schema.pre('find', applyTenantFilter);
  schema.pre('findOne', applyTenantFilter);
  schema.pre('count', applyTenantFilter);
  schema.pre('countDocuments', applyTenantFilter);

  const originalPaginate = schema.statics.paginate;

  schema.statics.paginate = async function (filter = {}, options = {}) {
    debugLog(
      '[TenantPlugin] paginate() - incoming options:',
      JSON.stringify(options || {})
    );
    const { user } = options;

    // SabyUser can see all users across all tenants
    if (user?.isSaby) {
      debugLog(
        '[TenantPlugin] SabyUser detected - no tenant filtering in pagination'
      );
      return originalPaginate.call(this, filter, options);
    }

    // SuperUser and Owner can only see users within their tenant
    if ((user?.isSuper || user?.isOwner) && !user?.isSaby) {
      debugLog('[TenantPlugin] Adding tenantId to filter:', user.tenantId);
      debugLog('[TenantPlugin] Adding tenantId to user:', JSON.stringify(user));
      filter = { ...filter, tenantId: user.tenantId };
    }

    return originalPaginate.call(this, filter, options);
  };
};

module.exports = tenantPlugin;
