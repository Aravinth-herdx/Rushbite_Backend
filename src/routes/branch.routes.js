const router = require('express').Router();
const { requireRole } = require('../middleware/rbac');
const { getBranches, getBranchById, createBranch, updateBranch, deleteBranch } = require('../controllers/branch.controller');

router.get('/', getBranches);
router.get('/:id', getBranchById);
router.post('/', requireRole('system_admin', 'cafeteria_manager'), createBranch);
router.put('/:id', requireRole('system_admin', 'cafeteria_manager'), updateBranch);
router.delete('/:id', requireRole('system_admin'), deleteBranch);

module.exports = router;
