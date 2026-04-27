const router = require('express').Router();
const { requireRole } = require('../middleware/rbac');
const { getFeedback, createFeedback, resolveFeedback, getFeedbackStats } = require('../controllers/feedback.controller');

router.get('/stats', getFeedbackStats);
router.get('/', getFeedback);
router.post('/', createFeedback);
router.patch('/:id/resolve', requireRole('system_admin', 'cafeteria_manager'), resolveFeedback);

module.exports = router;
