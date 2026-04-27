const router = require('express').Router();
const { requireRole, requirePermission } = require('../middleware/rbac');
const {
  getRoles, getRoleById, createRole, updateRole, deleteRole, getFranchiseRoles,
} = require('../controllers/role.controller');

// List roles (filtered by caller's franchise automatically in controller)
router.get('/', getRoles);

// Franchise-specific role list (admin: any franchise; manager: own franchise only)
router.get('/franchise/:franchiseId', getFranchiseRoles);

// Single role
router.get('/:id', getRoleById);

// Create: system_admin OR cafeteria_manager/others with manageRoles permission
// Permission check is handled inside the controller for non-admin callers
router.post('/', requireRole('system_admin', 'cafeteria_manager'), createRole);

// Update & Delete: same — controller enforces franchise ownership for non-admin
router.put('/:id', requireRole('system_admin', 'cafeteria_manager'), updateRole);
router.delete('/:id', requireRole('system_admin', 'cafeteria_manager'), deleteRole);

module.exports = router;
