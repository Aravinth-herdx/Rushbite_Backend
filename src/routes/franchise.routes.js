const router = require('express').Router();
const { requireRole } = require('../middleware/rbac');
const { uploadSingle } = require('../middleware/upload');
const { getFranchises, getFranchiseById, createFranchise, updateFranchise, deleteFranchise, getFranchiseStats } = require('../controllers/franchise.controller');

router.get('/', getFranchises);
router.get('/:id', getFranchiseById);
router.get('/:id/stats', getFranchiseStats);
router.post('/', requireRole('system_admin'), ...uploadSingle('logo', 'logos'), createFranchise);
router.put('/:id', requireRole('system_admin'), ...uploadSingle('logo', 'logos'), updateFranchise);
router.delete('/:id', requireRole('system_admin'), deleteFranchise);

module.exports = router;
