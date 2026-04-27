const AuditLog = require('../models/AuditLog');

/**
 * Middleware factory that auto-logs CUD operations
 * Usage: router.post('/', authenticate, auditLog('CREATE', 'user'), controller)
 */
const auditLog = (action, resource) => {
  return async (req, res, next) => {
    const originalJson = res.json.bind(res);

    res.json = async function (body) {
      try {
        if (req.user && body && body.success !== false) {
          const resourceId = body.data?._id || body.data?.id || req.params.id;
          const resourceName =
            body.data?.name ||
            body.data?.title ||
            body.data?.tokenNumber ||
            body.data?.email ||
            resourceId;

          await AuditLog.create({
            action,
            resource,
            resourceId: resourceId || null,
            resourceName: resourceName || '',
            userId: req.user._id,
            userName: req.user.name,
            userRole: req.user.role,
            franchiseId: req.user.franchiseId || null,
            branchId: req.user.branchId || null,
            changes: {
              before: req._auditBefore || null,
              after: body.data || null,
            },
            ip: req.ip || req.connection?.remoteAddress || '',
            userAgent: req.get('user-agent') || '',
          });
        }
      } catch (err) {
        // Don't fail the request if audit logging fails
        console.error('Audit log error:', err.message);
      }
      return originalJson(body);
    };

    next();
  };
};

module.exports = { auditLog };
