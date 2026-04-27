const AuditLog = require('../models/AuditLog');
const { getPaginationParams, buildPaginationMeta } = require('../utils/pagination');
const { success, paginated, error } = require('../utils/apiResponse');

// GET /audit
const getAuditLogs = async (req, res) => {
  try {
    const { page, limit, skip, sort } = getPaginationParams(req.query);
    const { action, resource, userId, dateFrom, dateTo, franchiseId, branchId } = req.query;

    const filter = {};
    if (req.user.role !== 'system_admin' && req.user.franchiseId) {
      filter.franchiseId = req.user.franchiseId;
    }
    if (franchiseId) filter.franchiseId = franchiseId;
    if (branchId) filter.branchId = branchId;
    if (action) filter.action = action;
    if (resource) filter.resource = resource;
    if (userId) filter.userId = userId;
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }

    const [logs, total] = await Promise.all([
      AuditLog.find(filter).sort(sort).skip(skip).limit(limit),
      AuditLog.countDocuments(filter),
    ]);

    return paginated(res, logs, buildPaginationMeta(total, page, limit));
  } catch (err) {
    console.error('Get audit logs error:', err);
    return error(res, 'Failed to fetch audit logs', 500);
  }
};

// GET /audit/:resource/:resourceId
const getResourceHistory = async (req, res) => {
  try {
    const { resource, resourceId } = req.params;
    const { page, limit, skip } = getPaginationParams(req.query);

    const filter = { resource, resourceId };

    const [logs, total] = await Promise.all([
      AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      AuditLog.countDocuments(filter),
    ]);

    return paginated(res, logs, buildPaginationMeta(total, page, limit));
  } catch (err) {
    console.error('Resource history error:', err);
    return error(res, 'Failed to fetch resource history', 500);
  }
};

module.exports = { getAuditLogs, getResourceHistory };
