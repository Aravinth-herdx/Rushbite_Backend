const router = require('express').Router();
const { requireRole } = require('../middleware/rbac');
const { getSalesReport, getOrderReport, getTopItems, getDailyRevenue, getStaffReport, getOverview, getDailySalesReport, getItemsReport, getFranchisePerformance } = require('../controllers/report.controller');

const reportAccess = requireRole('system_admin', 'cafeteria_manager');

router.get('/overview', reportAccess, getOverview);
router.get('/sales', reportAccess, getDailySalesReport);
router.get('/items', reportAccess, getItemsReport);
router.get('/orders', reportAccess, getOrderReport);
router.get('/top-items', reportAccess, getTopItems);
router.get('/daily-revenue', reportAccess, getDailyRevenue);
router.get('/staff', reportAccess, getStaffReport);
router.get('/franchise-performance', reportAccess, getFranchisePerformance);

module.exports = router;
