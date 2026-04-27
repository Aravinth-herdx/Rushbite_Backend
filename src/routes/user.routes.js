const router = require('express').Router();
const { requireRole } = require('../middleware/rbac');
const { uploadSingle } = require('../middleware/upload');
const { getUsers, getUserById, createUser, updateUser, deleteUser, toggleUserStatus, getUserStats, createBulkUsers, sendCredentials } = require('../controllers/user.controller');

router.get('/stats', requireRole('system_admin', 'cafeteria_manager'), getUserStats);
router.get('/', getUsers);
router.get('/:id', getUserById);
router.post('/', requireRole('system_admin', 'cafeteria_manager'), ...uploadSingle('avatar', 'avatars'), createUser);
router.post('/bulk', requireRole('system_admin', 'cafeteria_manager'), createBulkUsers);
router.put('/:id', requireRole('system_admin', 'cafeteria_manager'), ...uploadSingle('avatar', 'avatars'), updateUser);
router.delete('/:id', requireRole('system_admin'), deleteUser);
router.patch('/:id/status', requireRole('system_admin', 'cafeteria_manager'), toggleUserStatus);
router.post('/:id/send-credentials', requireRole('system_admin', 'cafeteria_manager'), sendCredentials);

module.exports = router;
