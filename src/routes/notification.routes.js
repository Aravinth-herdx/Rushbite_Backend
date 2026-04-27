const router = require('express').Router();
const { requireRole } = require('../middleware/rbac');
const { getNotifications, createNotification, markAsRead, deleteNotification } = require('../controllers/notification.controller');

router.get('/', getNotifications);
router.post('/', requireRole('system_admin', 'cafeteria_manager'), createNotification);
router.patch('/read', markAsRead);
router.delete('/:id', requireRole('system_admin', 'cafeteria_manager'), deleteNotification);

module.exports = router;
