const router = require('express').Router();
const authenticate = require('../middleware/auth');
const { uploadSingle } = require('../middleware/upload');
const { success } = require('../utils/apiResponse');
const Branch = require('../models/Branch');

const authRoutes = require('./auth.routes');
const userRoutes = require('./user.routes');
const roleRoutes = require('./role.routes');
const franchiseRoutes = require('./franchise.routes');
const branchRoutes = require('./branch.routes');
const menuRoutes = require('./menu.routes');
const orderRoutes = require('./order.routes');
const inventoryRoutes = require('./inventory.routes');
const promotionRoutes = require('./promotion.routes');
const notificationRoutes = require('./notification.routes');
const feedbackRoutes = require('./feedback.routes');
const reportRoutes = require('./report.routes');
const auditRoutes = require('./audit.routes');

router.use('/auth', authRoutes);
router.use('/users', authenticate, userRoutes);
router.use('/roles', authenticate, roleRoutes);
router.use('/franchises', authenticate, franchiseRoutes);
router.use('/branches', authenticate, branchRoutes);
router.use('/menu', authenticate, menuRoutes);
router.use('/orders', authenticate, orderRoutes);
router.use('/inventory', authenticate, inventoryRoutes);
router.use('/promotions', authenticate, promotionRoutes);
router.use('/notifications', authenticate, notificationRoutes);
router.use('/feedback', authenticate, feedbackRoutes);
router.use('/reports', authenticate, reportRoutes);
router.use('/audit', authenticate, auditRoutes);

// Upload endpoint
router.post(
  '/upload/:folder',
  authenticate,
  (req, res, next) => {
    const folder = req.params.folder;
    const allowed = ['menu', 'avatars', 'logos'];
    if (!allowed.includes(folder)) {
      return res.status(400).json({ success: false, message: 'Invalid upload folder' });
    }
    next();
  },
  (req, res, next) => {
    const folder = req.params.folder;
    const middleware = uploadSingle('file', folder);
    middleware[0](req, res, (err) => {
      if (err) return next(err);
      middleware[1](req, res, next);
    });
  },
  (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    return success(res, { url: req.fileUrl, fullUrl: req.fileFullUrl }, 'File uploaded successfully');
  }
);

// ── Guest web landing page ─────────────────────────────────────────────────────
// Called when a guest scans the branch QR with their native camera.
// QR format: http://{host}/join?branch={branchId}
// No auth required — this is a public HTML page for web/browser users.
router.get('/join', async (req, res) => {
  const { branch: branchId } = req.query;

  let branchName = 'CafeFlow Cafeteria';
  let branchAddress = '';
  let branchCode = '';

  if (branchId) {
    try {
      const branch = await Branch.findById(branchId).select('name address city code');
      if (branch) {
        branchName = branch.name;
        branchAddress = [branch.address, branch.city].filter(Boolean).join(', ');
        branchCode = branch.code || '';
      }
    } catch (_) { /* invalid id — use defaults */ }
  }

  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${branchName} – CafeFlow</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #f0f4f8; min-height: 100vh; display: flex;
           align-items: center; justify-content: center; padding: 24px; }
    .card { background: white; border-radius: 20px; padding: 36px 28px;
            max-width: 400px; width: 100%; box-shadow: 0 8px 32px rgba(0,0,0,.10); text-align: center; }
    .icon { width: 72px; height: 72px; background: #1A3C6E;
            border-radius: 18px; display: flex; align-items: center;
            justify-content: center; margin: 0 auto 20px; font-size: 36px; }
    h1 { color: #1A3C6E; font-size: 22px; font-weight: 800; margin-bottom: 6px; }
    .branch { color: #64748b; font-size: 14px; margin-bottom: 4px; }
    .code  { display: inline-block; background: #f0f4f8; color: #1A3C6E;
             font-family: monospace; font-size: 13px; font-weight: 700;
             letter-spacing: 2px; padding: 4px 14px; border-radius: 8px; margin-bottom: 28px; }
    .divider { border: none; border-top: 1px solid #e2e8f0; margin: 24px 0; }
    .info { background: #eff6ff; border-radius: 12px; padding: 16px; margin-bottom: 24px; }
    .info p { color: #3b82f6; font-size: 13px; line-height: 1.6; }
    .btn { display: block; width: 100%; padding: 14px;
           background: #F97316; color: white; border: none;
           border-radius: 12px; font-size: 15px; font-weight: 700;
           cursor: pointer; text-decoration: none; margin-bottom: 12px; }
    .btn-outline { background: transparent; border: 2px solid #1A3C6E;
                   color: #1A3C6E; }
    .footer { margin-top: 24px; color: #94a3b8; font-size: 12px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">☕</div>
    <h1>${branchName}</h1>
    ${branchAddress ? `<p class="branch">${branchAddress}</p>` : ''}
    ${branchCode ? `<span class="code">${branchCode}</span>` : '<br/>'}

    <div class="info">
      <p>Browse the menu and place your order from your browser — no app needed.</p>
    </div>

    <a href="/menu?branch=${branchId || ''}" class="btn">Browse Menu &amp; Order</a>
    <a href="cafeflow://app/branch/${branchId || ''}" class="btn btn-outline">Open in CafeFlow App</a>

    <hr class="divider"/>
    <p class="footer">Powered by CafeFlow &nbsp;·&nbsp; Scan the QR again to return</p>
  </div>
</body>
</html>`);
});

module.exports = router;
