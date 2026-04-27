const router = require('express').Router();
const { requireRole } = require('../middleware/rbac');
const { getPromotions, getPromotionById, createPromotion, updatePromotion, deletePromotion, validatePromotion, togglePromotion } = require('../controllers/promotion.controller');

router.post('/validate', validatePromotion);
router.get('/', getPromotions);
router.get('/:id', getPromotionById);
router.post('/', requireRole('system_admin', 'cafeteria_manager'), createPromotion);
router.put('/:id', requireRole('system_admin', 'cafeteria_manager'), updatePromotion);
router.delete('/:id', requireRole('system_admin', 'cafeteria_manager'), deletePromotion);
router.patch('/:id/toggle', requireRole('system_admin', 'cafeteria_manager'), togglePromotion);

module.exports = router;
