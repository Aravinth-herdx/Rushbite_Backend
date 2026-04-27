const router = require('express').Router();
const { getOrders, getOrderById, createOrder, updateOrderStatus, cancelOrder, getDashboardStats, getKitchenQueue, validateToken } = require('../controllers/order.controller');

router.get('/dashboard-stats', getDashboardStats);
router.get('/kitchen-queue', getKitchenQueue);
router.get('/validate/:token', validateToken);
router.get('/', getOrders);
router.get('/:id', getOrderById);
router.post('/', createOrder);
router.patch('/:id/status', updateOrderStatus);
router.patch('/:id/cancel', cancelOrder);

module.exports = router;
