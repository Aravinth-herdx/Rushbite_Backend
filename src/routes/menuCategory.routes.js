const router = require('express').Router();
const { requireRole } = require('../middleware/rbac');
const {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} = require('../controllers/menuCategory.controller');

router.get('/', getCategories);
router.post('/', requireRole('system_admin', 'cafeteria_manager'), createCategory);
router.put('/:id', requireRole('system_admin', 'cafeteria_manager'), updateCategory);
router.delete('/:id', requireRole('system_admin', 'cafeteria_manager'), deleteCategory);

module.exports = router;
