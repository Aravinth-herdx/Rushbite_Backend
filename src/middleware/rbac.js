const { forbidden } = require('../utils/apiResponse');

/**
 * Require one of the specified roles
 */
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return forbidden(res, 'Access denied');
    }
    if (!roles.includes(req.user.role)) {
      return forbidden(res, `Role '${req.user.role}' is not authorized for this action`);
    }
    next();
  };
};

/**
 * Require a specific permission from the user's permissions object
 */
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return forbidden(res, 'Access denied');
    }
    // system_admin bypasses all permission checks
    if (req.user.role === 'system_admin') {
      return next();
    }
    if (!req.user.permissions || !req.user.permissions[permission]) {
      return forbidden(res, `Permission '${permission}' is required`);
    }
    next();
  };
};

/**
 * Ensure a non-admin user can only access data from their own franchise
 */
const requireSameFranchise = (req, res, next) => {
  if (!req.user) {
    return forbidden(res, 'Access denied');
  }
  // system_admin can access all franchises
  if (req.user.role === 'system_admin') {
    return next();
  }

  const franchiseId = req.params.franchiseId || req.query.franchiseId || req.body.franchiseId;

  if (franchiseId && req.user.franchiseId) {
    if (franchiseId.toString() !== req.user.franchiseId.toString()) {
      return forbidden(res, 'You can only access data from your own franchise');
    }
  }
  next();
};

module.exports = { requireRole, requirePermission, requireSameFranchise };
