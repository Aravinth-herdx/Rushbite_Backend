const Feedback = require('../models/Feedback');
const MenuItem = require('../models/MenuItem');
const Order = require('../models/Order');
const { getPaginationParams, buildPaginationMeta } = require('../utils/pagination');
const { success, created, paginated, error, notFound } = require('../utils/apiResponse');

// GET /feedback
const getFeedback = async (req, res) => {
  try {
    const { page, limit, skip, sort } = getPaginationParams(req.query);
    const { rating, isResolved, category, dateFrom, dateTo, franchiseId, branchId, menuItemId } = req.query;

    const filter = {};
    if (req.user.role !== 'system_admin' && req.user.franchiseId) {
      filter.franchiseId = req.user.franchiseId;
    }
    if (franchiseId) filter.franchiseId = franchiseId;
    if (branchId) filter.branchId = branchId;
    if (menuItemId) filter.menuItemIds = menuItemId; // matches any item in the array
    if (rating) filter.rating = parseInt(rating);
    if (isResolved !== undefined) filter.isResolved = isResolved === 'true';
    if (category) filter.category = category;
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }

    const [feedbacks, total] = await Promise.all([
      Feedback.find(filter).sort(sort).skip(skip).limit(limit).populate('orderId', 'tokenNumber'),
      Feedback.countDocuments(filter),
    ]);

    return paginated(res, feedbacks, buildPaginationMeta(total, page, limit));
  } catch (err) {
    console.error('Get feedback error:', err);
    return error(res, 'Failed to fetch feedback', 500);
  }
};

// POST /feedback
const createFeedback = async (req, res) => {
  try {
    const { franchiseId, branchId, orderId, customerName, customerPhone, rating, comment, category, isAnonymous } = req.body;
    if (!rating || rating < 1 || rating > 5) return error(res, 'Rating must be between 1 and 5', 400);
    if (!franchiseId || !branchId) return error(res, 'franchiseId and branchId are required', 400);

    const ratingInt = parseInt(rating);

    // ── Resolve menu item IDs from the order ─────────────────────────────────
    let menuItemIds = [];
    if (orderId) {
      const order = await Order.findById(orderId).select('items').lean();
      if (order?.items?.length) {
        menuItemIds = order.items
          .map((i) => i.menuItemId)
          .filter(Boolean);
      }
    }

    const feedback = await Feedback.create({
      franchiseId, branchId,
      orderId: orderId || null,
      menuItemIds,
      customerId: req.user?.role !== 'system_admin' ? req.user?._id : null,
      customerName: isAnonymous ? 'Anonymous' : (customerName || 'Anonymous'),
      customerPhone: isAnonymous ? '' : (customerPhone || ''),
      rating: ratingInt,
      comment: comment || '',
      category: category || 'overall',
      isAnonymous: Boolean(isAnonymous),
    });

    // ── Update MenuItem.ratings for each item in the order ───────────────────
    // Only propagate ratings for food/overall categories (not service/cleanliness)
    if (menuItemIds.length > 0 && ['food_quality', 'overall'].includes(category || 'overall')) {
      await Promise.all(
        menuItemIds.map(async (menuItemId) => {
          // Atomically increment total and count, then recompute average
          const updated = await MenuItem.findByIdAndUpdate(
            menuItemId,
            {
              $inc: { 'ratings.total': ratingInt, 'ratings.count': 1 },
            },
            { new: true }
          );
          if (updated) {
            const avg = updated.ratings.count > 0
              ? updated.ratings.total / updated.ratings.count
              : 0;
            await MenuItem.findByIdAndUpdate(menuItemId, {
              'ratings.average': Math.round(avg * 10) / 10,
            });
          }
        })
      );
    }

    return created(res, feedback, 'Feedback submitted');
  } catch (err) {
    console.error('Create feedback error:', err);
    return error(res, 'Failed to submit feedback', 500);
  }
};

// PATCH /feedback/:id/resolve
const resolveFeedback = async (req, res) => {
  try {
    const { resolveNote } = req.body;
    const feedback = await Feedback.findById(req.params.id);
    if (!feedback) return notFound(res, 'Feedback not found');

    const updated = await Feedback.findByIdAndUpdate(
      req.params.id,
      { isResolved: true, resolvedBy: req.user._id, resolvedAt: new Date(), resolveNote: resolveNote || '' },
      { new: true }
    );

    return success(res, updated, 'Feedback resolved');
  } catch (err) {
    console.error('Resolve feedback error:', err);
    return error(res, 'Failed to resolve feedback', 500);
  }
};

// GET /feedback/stats
const getFeedbackStats = async (req, res) => {
  try {
    const filter = {};
    if (req.user.role !== 'system_admin' && req.user.franchiseId) {
      filter.franchiseId = req.user.franchiseId;
    }
    if (req.query.franchiseId) filter.franchiseId = req.query.franchiseId;
    if (req.query.branchId) filter.branchId = req.query.branchId;

    const stats = await Feedback.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          averageRating: { $avg: '$rating' },
          resolved: { $sum: { $cond: ['$isResolved', 1, 0] } },
          unresolved: { $sum: { $cond: ['$isResolved', 0, 1] } },
          rating1: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
          rating2: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
          rating3: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
          rating4: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
          rating5: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } },
        },
      },
    ]);

    const byCategory = await Feedback.aggregate([
      { $match: filter },
      { $group: { _id: '$category', count: { $sum: 1 }, avgRating: { $avg: '$rating' } } },
    ]);

    return success(res, {
      ...(stats[0] || { total: 0, averageRating: 0, resolved: 0, unresolved: 0 }),
      byCategory,
    });
  } catch (err) {
    console.error('Feedback stats error:', err);
    return error(res, 'Failed to fetch feedback stats', 500);
  }
};

module.exports = { getFeedback, createFeedback, resolveFeedback, getFeedbackStats };
