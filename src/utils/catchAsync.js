/**
 * A utility function that wraps async route handlers to handle errors automatically
 * and capture universal audit trail entries.
 *
 * This function takes an async route handler and returns a new function that:
 * 1. Executes the handler
 * 2. Automatically catches any errors
 * 3. Passes errors to Express error handling middleware
 * 4. Fires an audit trail entry after the response is sent (fire & forget)
 *
 * Example usage:
 *
 * // Default audit (auto-infers resource and action from path/method)
 * app.get('/users', auth(), catchAsync(async (req, res) => {
 *   const users = await User.find();
 *   res.json(users);
 * }));
 *
 * // Explicit audit options
 * app.post('/users', auth(), catchAsync(async (req, res) => {
 *   const user = await UserService.create(req.body);
 *   res.status(201).json(user);
 * }, { resource: 'user', action: 'create' }));
 *
 * // Skip audit for health checks etc.
 * app.get('/health', catchAsync(async (req, res) => {
 *   res.json({ ok: true });
 * }, { skip: true }));
 *
 * @param {Function} fn - The async route handler function to wrap
 * @param {Object}  [opts] - Audit options
 * @param {boolean} [opts.skip] - Skip audit for this route
 * @param {string}  [opts.resource] - Override resource type
 * @param {string}  [opts.action] - Override action name
 * @param {string}  [opts.resourceId] - Override resource ID
 * @param {string}  [opts.source] - Override source (default: 'api')
 * @returns {Function} - Express middleware function
 */
const catchAsync = (fn, opts) => {
  // Backward compat: if called as catchAsync(fn) without opts, opts is undefined
  const auditOpts = typeof opts === 'object' && opts !== null ? opts : {};
  const skipAudit = auditOpts.skip;

  return (req, res, next) => {
    if (skipAudit) {
      return Promise.resolve(fn(req, res, next)).catch((err) => next(err));
    }

    const started = Date.now();

    // Schedule audit AFTER response is sent — never blocks the client
    res.on('finish', () => {
      try {
        // Lazy-require to avoid circular dependencies at module load time
        const { logAuditEntry } = require('./auditLogger');
        logAuditEntry(req, res, started, auditOpts);
      } catch (_) {
        // Audit failure must never propagate to the client
      }
    });

    return Promise.resolve(fn(req, res, next)).catch((err) => next(err));
  };
};

module.exports = catchAsync;
