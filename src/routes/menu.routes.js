const router = require('express').Router();
const { requireRole } = require('../middleware/rbac');
const { uploadMultiple } = require('../middleware/upload');
const {
  getMenuItems, getActiveWindow, getMenuItemById,
  createMenuItem, updateMenuItem, deleteMenuItem,
  toggleAvailability, bulkUpdateAvailability,
  linkToBranch, unlinkFromBranch, getBranchOverrides,
  resetDailyCount, getTopPerformers, getRecommendations,
  getMenuItemRatings,
} = require('../controllers/menu.controller');
const menuCategoryRoutes = require('./menuCategory.routes');

// ── Category sub-routes — MUST be before /:id ─────────────────────────────────
router.use('/categories', menuCategoryRoutes);

// ── Non-param routes — MUST be before /:id ────────────────────────────────────
router.get('/top-performers',   getTopPerformers);
router.get('/recommendations',  getRecommendations);
router.get('/active-window',    getActiveWindow);          // IST-aware window detection
router.post('/bulk-availability',
  requireRole('system_admin', 'cafeteria_manager'), bulkUpdateAvailability);

// ── Collection routes ─────────────────────────────────────────────────────────
router.get('/', getMenuItems);
router.post('/',
  requireRole('system_admin', 'cafeteria_manager'),
  ...uploadMultiple('images', 'menu', 5),
  createMenuItem);

// ── Item-level sub-routes (before generic /:id) ───────────────────────────────
router.get('/:id/overrides', getBranchOverrides);
router.post('/:id/link-branch',
  requireRole('system_admin', 'cafeteria_manager'), linkToBranch);
router.delete('/:id/link-branch/:branchId',
  requireRole('system_admin', 'cafeteria_manager'), unlinkFromBranch);
router.post('/:id/reset-daily',
  requireRole('system_admin', 'cafeteria_manager'), resetDailyCount);
router.get('/:id/ratings', getMenuItemRatings);
router.patch('/:id/toggle',
  requireRole('system_admin', 'cafeteria_manager', 'kitchen_staff'), toggleAvailability);

// ── Generic item routes ───────────────────────────────────────────────────────
router.get('/:id', getMenuItemById);
router.put('/:id',
  requireRole('system_admin', 'cafeteria_manager'),
  ...uploadMultiple('images', 'menu', 5),
  updateMenuItem);
router.delete('/:id',
  requireRole('system_admin', 'cafeteria_manager'), deleteMenuItem);

module.exports = router;
