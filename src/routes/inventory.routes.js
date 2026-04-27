const router = require('express').Router();
const { requireRole } = require('../middleware/rbac');
const { uploadSingle, uploadMultiple } = require('../middleware/upload');
const {
  getInventory, getInventoryById,
  createInventoryItem, updateInventoryItem, deleteInventoryItem,
  adjustStock, restockItem,
  getMovements, getItemMovements, getItemLots,
  getLowStockItems, getInventoryStats, getCategoryStats,
  getVelocityAnalytics,
} = require('../controllers/inventory.controller');
const {
  getCategories, createCategory, updateCategory, deleteCategory,
} = require('../controllers/inventory_category.controller');
const {
  getSuppliers, getSupplierById,
  createSupplier, updateSupplier, deleteSupplier,
  linkBranch, unlinkBranch,
  getMovementSupplierNames,
} = require('../controllers/supplier.controller');

const canManage = requireRole('system_admin', 'cafeteria_manager');

// ── Stats & Summary ──────────────────────────────────────────────────────────
router.get('/stats', getInventoryStats);
router.get('/low-stock', getLowStockItems);
router.get('/analytics/velocity', getVelocityAnalytics);

// ── Categories ───────────────────────────────────────────────────────────────
router.get('/categories', getCategories);
router.get('/categories/stats', getCategoryStats);
router.post('/categories', canManage, ...uploadSingle('image', 'categories'), createCategory);
router.put('/categories/:id', canManage, ...uploadSingle('image', 'categories'), updateCategory);
router.delete('/categories/:id', canManage, deleteCategory);

// ── Suppliers  (MUST be before /:id) ─────────────────────────────────────────
router.get('/suppliers', getSuppliers);
router.post('/suppliers', canManage, createSupplier);
router.get('/suppliers/:id', getSupplierById);
router.put('/suppliers/:id', canManage, updateSupplier);
router.delete('/suppliers/:id', canManage, deleteSupplier);
router.post('/suppliers/:id/link-branch', canManage, linkBranch);
router.delete('/suppliers/:id/branches/:branchId', canManage, unlinkBranch);

// ── Stock Movements (global history) ────────────────────────────────────────
router.get('/movements', getMovements);
router.get('/movements/suppliers', getMovementSupplierNames); // must be before /movements is consumed

// ── Inventory Items ──────────────────────────────────────────────────────────
router.get('/', getInventory);
router.post('/', canManage, ...uploadSingle('image', 'inventory'), createInventoryItem);
router.get('/:id', getInventoryById);
router.put('/:id', canManage, ...uploadSingle('image', 'inventory'), updateInventoryItem);
router.delete('/:id', canManage, deleteInventoryItem);

// ── Per-Item Stock Movements & Lots ─────────────────────────────────────────
router.get('/:id/movements', getItemMovements);
router.get('/:id/lots', getItemLots);
router.post('/:id/adjust', canManage, ...uploadMultiple('attachments', 'movements'), adjustStock);
router.post('/:id/restock', canManage, restockItem); // backward-compat

module.exports = router;
