const router = require('express').Router();
const { requireRole } = require('../middleware/rbac');
const { getAuditLogs, getResourceHistory } = require('../controllers/audit.controller');

const auditAccess = requireRole('system_admin', 'cafeteria_manager');

router.get('/', auditAccess, getAuditLogs);
router.get('/:resource/:resourceId', auditAccess, getResourceHistory);

module.exports = router;
