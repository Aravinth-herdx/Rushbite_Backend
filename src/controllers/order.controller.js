const Order = require('../models/Order');
const MenuItem = require('../models/MenuItem');
const Branch = require('../models/Branch');
const Promotion = require('../models/Promotion');
const DailySummary = require('../models/DailySummary');
const { getPaginationParams, buildPaginationMeta } = require('../utils/pagination');
const { success, created, paginated, error, notFound } = require('../utils/apiResponse');
const { generateOrderToken } = require('../utils/tokenGenerator');

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Returns today's date string in IST (UTC+5:30) as 'YYYY-MM-DD'
function getTodayIST() {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

// Atomically upserts the DailySummary for a branch+date.
// `inc` is an object of field increments, e.g. { totalOrders: 1, received: 1 }
async function bumpSummary(franchiseId, branchId, inc) {
  if (!franchiseId || !branchId) return;
  try {
    const $inc = { ...inc };
    // Service window keys live inside the byWindow Map — use dot-notation
    if (inc._window) {
      $inc[`byWindow.${inc._window}`] = 1;
      delete $inc._window;
    }
    await DailySummary.findOneAndUpdate(
      { date: getTodayIST(), franchiseId, branchId },
      { $inc: $inc, $set: { updatedAt: new Date() } },
      { upsert: true, new: true }
    );
  } catch (e) {
    // Non-fatal: summary update failure must never break the order flow
    console.error('[DailySummary] bump error:', e.message);
  }
}

// GET /orders
const getOrders = async (req, res) => {
  try {
    const { page, limit, skip, sort } = getPaginationParams(req.query);
    const { status, dateFrom, dateTo, serviceWindow, search, franchiseId, branchId, isWalkin } = req.query;

    const filter = { isDeleted: false };

    if (req.user.role !== 'system_admin' && req.user.franchiseId) {
      filter.franchiseId = req.user.franchiseId;
    }
    if (req.user.branchId && req.user.role !== 'system_admin' && req.user.role !== 'cafeteria_manager') {
      filter.branchId = req.user.branchId;
    }
    if (franchiseId) filter.franchiseId = franchiseId;
    if (branchId) filter.branchId = branchId;
    if (status && status !== 'all') filter.status = status;
    if (serviceWindow) filter.serviceWindow = serviceWindow;
    if (isWalkin !== undefined) filter.isWalkin = isWalkin === 'true';
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }
    if (search) {
      filter.$or = [
        { tokenNumber: { $regex: search, $options: 'i' } },
        { customerName: { $regex: search, $options: 'i' } },
        { customerPhone: { $regex: search, $options: 'i' } },
      ];
    }

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .populate('branchId', 'name code')
        .populate('franchiseId', 'name code')
        .populate('createdBy', 'name')
        .sort(sort)
        .skip(skip)
        .limit(limit),
      Order.countDocuments(filter),
    ]);

    return paginated(res, orders, buildPaginationMeta(total, page, limit));
  } catch (err) {
    console.error('Get orders error:', err);
    return error(res, 'Failed to fetch orders', 500);
  }
};

// GET /orders/:id
const getOrderById = async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, isDeleted: false })
      .populate('branchId', 'name code')
      .populate('franchiseId', 'name code')
      .populate('customerId', 'name email phone')
      .populate('createdBy', 'name')
      .populate('servedBy', 'name');

    if (!order) return notFound(res, 'Order not found');
    return success(res, order);
  } catch (err) {
    console.error('Get order error:', err);
    return error(res, 'Failed to fetch order', 500);
  }
};

// POST /orders
const createOrder = async (req, res) => {
  try {
    const {
      branchId, customerId, customerName, customerPhone,
      isWalkin, items, paymentMode, serviceWindow,
      pickupSlot, notes, promotionCode,
    } = req.body;

    if (!branchId || !items || items.length === 0) {
      return error(res, 'branchId and items are required', 400);
    }

    const branch = await Branch.findOne({
      _id: branchId,
      isDeleted: false,
    });

    if (!branch) return error(res, 'Branch not found', 404);

    const franchiseId = branch.franchiseId;

    const orderItems = [];
    let subtotal = 0;
    let taxAmount = 0;

    // IST midnight for daily-limit reset check
    const nowUtc = new Date();
    const istMidnight = new Date(
      Date.UTC(
        nowUtc.getUTCFullYear(),
        nowUtc.getUTCMonth(),
        nowUtc.getUTCDate(),
        0, 0, 0, 0
      ) - 5.5 * 60 * 60 * 1000   // subtract 5h30m so IST midnight = UTC 18:30 prev day
    );

    const menuItemDocs = []; // keep refs for post-order dailySoldCount bump

    for (const item of items) {
      const menuItem = await MenuItem.findOne({
        _id: item.menuItemId,
        isDeleted: false,
        isAvailable: true,
      });

      if (!menuItem) {
        return error(res, `Menu item not available: ${item.menuItemId}`, 400);
      }

      // ── Daily limit check ────────────────────────────────────────────────
      if (menuItem.dailyLimit > 0) {
        const resetDate = menuItem.dailyResetDate;
        const stale = !resetDate || resetDate < istMidnight;
        const soldCount = stale ? 0 : menuItem.dailySoldCount;
        const remaining = menuItem.dailyLimit - soldCount;

        if (item.quantity > remaining) {
          const available = remaining > 0 ? remaining : 0;
          return error(
            res,
            `"${menuItem.name}" has only ${available} portion(s) left for today.`,
            400
          );
        }
      }

      const itemSubtotal = (menuItem.price + menuItem.tax) * item.quantity;

      orderItems.push({
        menuItemId: menuItem._id,
        name: menuItem.name,
        price: menuItem.price,
        tax: menuItem.tax,
        quantity: item.quantity,
        specialNote: item.specialNote || '',
        subtotal: itemSubtotal,
      });

      subtotal += menuItem.price * item.quantity;
      taxAmount += menuItem.tax * item.quantity;

      menuItemDocs.push({ doc: menuItem, quantity: item.quantity });
    }

    let discount = 0;
    let promotionId = null;

    if (promotionCode) {
      const promo = await Promotion.findOne({
        franchiseId,
        code: promotionCode.toUpperCase(),
        isActive: true,
        isDeleted: false,
        validFrom: { $lte: new Date() },
        validUntil: { $gte: new Date() },
      });

      if (promo) {
        const orderTotal = subtotal + taxAmount;

        if (orderTotal >= promo.minOrderValue) {
          if (promo.discountType === 'percent') {
            discount = (orderTotal * promo.discountValue) / 100;
            if (promo.maxDiscount > 0) {
              discount = Math.min(discount, promo.maxDiscount);
            }
          } else {
            discount = promo.discountValue;
          }

          promotionId = promo._id;

          if (promo.usageLimit > 0) {
            await Promotion.findByIdAndUpdate(promo._id, {
              $inc: { usageCount: 1 },
            });
          }
        }
      }
    }

    const totalAmount = Math.max(0, subtotal + taxAmount - discount);

    const tokenNumber = await generateOrderToken(
      branch.code,
      serviceWindow || 'Lunch'
    );

    const order = await Order.create({
      tokenNumber,
      franchiseId,
      branchId,
      customerId: customerId || null,
      customerName: customerName || 'Walk-in Customer',
      customerPhone: customerPhone || '',
      isWalkin: Boolean(isWalkin),
      items: orderItems,
      status: 'received',
      subtotal,
      taxAmount,
      discount,
      totalAmount,
      paymentMode: paymentMode || 'cash',
      paymentStatus: 'pending',
      promotionId,
      serviceWindow: serviceWindow || '',
      pickupSlot: pickupSlot || '',
      notes: notes || '',
      statusHistory: [
        {
          status: 'received',
          updatedBy: req.user?._id || null,
          updatedAt: new Date(),
        },
      ],
      createdBy: req.user?._id || null,
    });

    await Branch.findByIdAndUpdate(branchId, {
      $inc: {
        'stats.totalOrders': 1,
        'stats.pendingOrders': 1,
      },
    });

    // ── Increment dailySoldCount for items that have a daily limit ────────
    for (const { doc, quantity } of menuItemDocs) {
      if (doc.dailyLimit > 0) {
        const resetDate = doc.dailyResetDate;
        const stale = !resetDate || resetDate < istMidnight;
        if (stale) {
          // Reset counter for today then set to this order's quantity
          await MenuItem.findByIdAndUpdate(doc._id, {
            dailySoldCount: quantity,
            dailyResetDate: istMidnight,
          });
        } else {
          await MenuItem.findByIdAndUpdate(doc._id, {
            $inc: { dailySoldCount: quantity },
          });
        }
      }
    }

    await bumpSummary(franchiseId, branchId, {
      totalOrders: 1,
      totalRevenue: totalAmount,
      received: 1,
      walkIn: order.isWalkin ? 1 : 0,
      _window: order.serviceWindow || 'Other',
    });

    const saved = await Order.findById(order._id)
      .populate('branchId', 'name code')
      .populate('franchiseId', 'name code');

    return created(res, saved, 'Order created successfully');
  } catch (err) {
    console.error('Create order error:', err);
    return error(res, 'Failed to create order', 500);
  }
};

// ─── Role-based order status transition map ───────────────────────────────────
//
//  received  → (order placed by customer/counter/employee/guest via createOrder)
//  accepted  → kitchen_staff | cafeteria_manager | system_admin
//  preparing → kitchen_staff | cafeteria_manager | system_admin
//  ready     → kitchen_staff | cafeteria_manager | system_admin
//  served    → counter_staff | cafeteria_manager | system_admin
//  cancelled → any role, but only when status is received | accepted
//              (enforced in cancelOrder; also checked here)
//
const STATUS_ROLES = {
  accepted:  ['kitchen_staff', 'cafeteria_manager', 'system_admin'],
  preparing: ['kitchen_staff', 'cafeteria_manager', 'system_admin'],
  ready:     ['kitchen_staff', 'cafeteria_manager', 'system_admin'],
  served:    ['counter_staff', 'cafeteria_manager', 'system_admin'],
  cancelled: ['kitchen_staff', 'cafeteria_manager', 'system_admin', 'counter_staff', 'employee', 'guest'],
};

// PATCH /orders/:id/status
const updateOrderStatus = async (req, res) => {
  try {
    const { status, note } = req.body;
    const validStatuses = ['received', 'accepted', 'preparing', 'ready', 'served', 'cancelled'];
    if (!status || !validStatuses.includes(status)) {
      return error(res, 'Invalid status', 400);
    }

    // Role-based transition guard
    const allowedRoles = STATUS_ROLES[status];
    if (allowedRoles && !allowedRoles.includes(req.user.role)) {
      return error(res, `Role '${req.user.role}' cannot set order status to '${status}'`, 403);
    }

    const order = await Order.findOne({ _id: req.params.id, isDeleted: false });
    if (!order) return notFound(res, 'Order not found');

    // Cancellation only allowed from received or accepted
    if (status === 'cancelled' && !['received', 'accepted'].includes(order.status)) {
      return error(res, 'Order can only be cancelled when in received or accepted status', 400);
    }

    const prevStatus = order.status;
    const statusHistory = [...order.statusHistory, { status, updatedBy: req.user._id, updatedAt: new Date(), note: note || '' }];
    const updates = { status, statusHistory };

    if (status === 'served') {
      updates.servedBy = req.user._id;
      updates.paymentStatus = 'paid';
      await Branch.findByIdAndUpdate(order.branchId, {
        $inc: { 'stats.pendingOrders': -1, 'stats.todayRevenue': order.totalAmount },
      });
    }
    if (status === 'cancelled') {
      await Branch.findByIdAndUpdate(order.branchId, { $inc: { 'stats.pendingOrders': -1 } });
    }

    // Maintain DailySummary: decrement previous bucket, increment new bucket
    const summaryInc = {};
    if (prevStatus && prevStatus !== status) summaryInc[prevStatus] = -1;
    summaryInc[status] = (summaryInc[status] || 0) + 1;
    await bumpSummary(order.franchiseId, order.branchId, summaryInc);

    const updated = await Order.findByIdAndUpdate(req.params.id, updates, { new: true })
      .populate('branchId', 'name code')
      .populate('franchiseId', 'name code');

    return success(res, updated, `Order status updated to ${status}`);
  } catch (err) {
    console.error('Update order status error:', err);
    return error(res, 'Failed to update order status', 500);
  }
};

// PATCH /orders/:id/cancel
const cancelOrder = async (req, res) => {
  try {
    const { cancelReason } = req.body;
    const order = await Order.findOne({ _id: req.params.id, isDeleted: false });
    if (!order) return notFound(res, 'Order not found');
    if (!['received', 'accepted'].includes(order.status)) {
      return error(res, 'Order cannot be cancelled at this stage', 400);
    }

    const prevStatus = order.status;
    const statusHistory = [...order.statusHistory, { status: 'cancelled', updatedBy: req.user._id, updatedAt: new Date(), note: cancelReason || '' }];
    const updated = await Order.findByIdAndUpdate(
      req.params.id,
      { status: 'cancelled', cancelReason: cancelReason || '', statusHistory },
      { new: true }
    );

    await Branch.findByIdAndUpdate(order.branchId, { $inc: { 'stats.pendingOrders': -1 } });

    // Maintain DailySummary
    const cancelInc = { cancelled: 1 };
    if (prevStatus) cancelInc[prevStatus] = -1;
    await bumpSummary(order.franchiseId, order.branchId, cancelInc);

    return success(res, updated, 'Order cancelled');
  } catch (err) {
    console.error('Cancel order error:', err);
    return error(res, 'Failed to cancel order', 500);
  }
};

// GET /orders/dashboard-stats
// Fast path: reads from DailySummary (O(1) per branch).
// Falls back to live aggregation for the first request of the day before any summary exists.
const getDashboardStats = async (req, res) => {
  try {
    const franchiseId = req.user.role !== 'system_admin'
      ? (req.user.franchiseId || req.query.franchiseId)
      : req.query.franchiseId;
    const branchId = req.user.branchId || req.query.branchId;
    const today = getTodayIST();

    // ── 1. Try O(1) summary read ─────────────────────────────────────────────
    const summaryFilter = { date: today };
    if (franchiseId) summaryFilter.franchiseId = franchiseId;
    if (branchId)    summaryFilter.branchId    = branchId;

    const summaries = await DailySummary.find(summaryFilter).lean();

    if (summaries.length > 0) {
      // Roll up across branches (when admin views without branch filter)
      const rolled = summaries.reduce(
        (acc, s) => {
          acc.totalOrders  += s.totalOrders  || 0;
          acc.totalRevenue += s.totalRevenue || 0;
          acc.received     += s.received     || 0;
          acc.accepted     += s.accepted     || 0;
          acc.preparing    += s.preparing    || 0;
          acc.ready        += s.ready        || 0;
          acc.served       += s.served       || 0;
          acc.cancelled    += s.cancelled    || 0;
          acc.walkIn       += s.walkIn       || 0;
          // Merge byWindow Maps
          if (s.byWindow) {
            for (const [win, cnt] of Object.entries(s.byWindow)) {
              acc._winMap[win] = (acc._winMap[win] || 0) + cnt;
            }
          }
          return acc;
        },
        { totalOrders: 0, totalRevenue: 0, received: 0, accepted: 0, preparing: 0,
          ready: 0, served: 0, cancelled: 0, walkIn: 0, _winMap: {} }
      );

      const byWindow = Object.entries(rolled._winMap).map(([_id, count]) => ({ _id, count }));
      delete rolled._winMap;
      return success(res, { ...rolled, byWindow, date: today, source: 'summary' });
    }

    // ── 2. Fallback: live aggregation (first request of day / backfill) ──────
    const startOfDay = new Date(`${today}T00:00:00+05:30`);
    const endOfDay   = new Date(`${today}T23:59:59+05:30`);
    const filter = { createdAt: { $gte: startOfDay, $lte: endOfDay }, isDeleted: false };
    if (franchiseId) filter.franchiseId = franchiseId;
    if (branchId)    filter.branchId    = branchId;

    const [stats, byWindowRaw] = await Promise.all([
      Order.aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            totalOrders:  { $sum: 1 },
            totalRevenue: { $sum: '$totalAmount' },
            received:  { $sum: { $cond: [{ $eq: ['$status', 'received']  }, 1, 0] } },
            accepted:  { $sum: { $cond: [{ $eq: ['$status', 'accepted']  }, 1, 0] } },
            preparing: { $sum: { $cond: [{ $eq: ['$status', 'preparing'] }, 1, 0] } },
            ready:     { $sum: { $cond: [{ $eq: ['$status', 'ready']     }, 1, 0] } },
            served:    { $sum: { $cond: [{ $eq: ['$status', 'served']    }, 1, 0] } },
            cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
            walkIn:    { $sum: { $cond: ['$isWalkin', 1, 0] } },
          },
        },
      ]),
      Order.aggregate([
        { $match: filter },
        { $group: { _id: '$serviceWindow', count: { $sum: 1 } } },
      ]),
    ]);

    const result = stats[0] || {
      totalOrders: 0, totalRevenue: 0, received: 0, accepted: 0,
      preparing: 0, ready: 0, served: 0, cancelled: 0, walkIn: 0,
    };

    return success(res, { ...result, byWindow: byWindowRaw, date: today, source: 'aggregation' });
  } catch (err) {
    console.error('Dashboard stats error:', err);
    return error(res, 'Failed to fetch dashboard stats', 500);
  }
};

// GET /orders/kitchen-queue
const getKitchenQueue = async (req, res) => {
  try {
    // Include 'received' so kitchen staff can see and accept new orders
    const filter = {
      status: { $in: ['received', 'accepted', 'preparing', 'ready'] },
      isDeleted: false,
    };
    if (req.user.franchiseId) filter.franchiseId = req.user.franchiseId;
    if (req.user.branchId) filter.branchId = req.user.branchId;
    if (req.query.franchiseId) filter.franchiseId = req.query.franchiseId;
    if (req.query.branchId) filter.branchId = req.query.branchId;

    const orders = await Order.find(filter)
      .sort({ createdAt: 1 })
      .limit(50)
      .populate('branchId', 'name code');

    return success(res, orders);
  } catch (err) {
    console.error('Kitchen queue error:', err);
    return error(res, 'Failed to fetch kitchen queue', 500);
  }
};

// GET /orders/validate/:token
const validateToken = async (req, res) => {
  try {
    const { token } = req.params;
    const filter = { tokenNumber: token.toUpperCase(), isDeleted: false };
    if (req.user.franchiseId) filter.franchiseId = req.user.franchiseId;

    const order = await Order.findOne(filter)
      .populate('branchId', 'name code')
      .populate('franchiseId', 'name code');

    if (!order) return notFound(res, 'Token not found');
    return success(res, order);
  } catch (err) {
    console.error('Validate token error:', err);
    return error(res, 'Failed to validate token', 500);
  }
};

module.exports = { getOrders, getOrderById, createOrder, updateOrderStatus, cancelOrder, getDashboardStats, getKitchenQueue, validateToken };
