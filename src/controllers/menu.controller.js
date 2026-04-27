const mongoose = require('mongoose');
const MenuItem = require('../models/MenuItem');
const MenuCategory = require('../models/MenuCategory');
const BranchMenuOverride = require('../models/BranchMenuOverride');
const AuditLog = require('../models/AuditLog');
const Branch = require('../models/Branch');
const { getPaginationParams, buildPaginationMeta } = require('../utils/pagination');
const { success, created, paginated, error, notFound } = require('../utils/apiResponse');

// ── Helpers ───────────────────────────────────────────────────────────────────

const parseField = (val) => {
  if (val === undefined || val === null) return undefined;
  if (typeof val !== 'string') return val;
  try { return JSON.parse(val); } catch { return val; }
};

// Standard populate for category name display
const CATEGORY_POPULATE = { path: 'categoryId', select: 'name displayOrder' };
const BRANCH_POPULATE   = { path: 'branchId',   select: 'name code' };
const FRANCHISE_POPULATE = { path: 'franchiseId', select: 'name code' };

/**
 * Get current IST hour (UTC+5:30).
 * Returns the hour in 24h format (0-23).
 */
const getISTHour = () => {
  const utcNow = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000; // IST = UTC + 5:30
  const istNow = new Date(utcNow.getTime() + istOffset);
  return istNow.getHours();
};

/**
 * Detect the currently active service window from a branch document.
 * Returns the window name string or null if none active.
 */
const detectActiveWindow = (branch) => {
  if (!branch || !branch.serviceWindows) return null;
  const istHour = getISTHour();
  const currentMinutes = istHour * 60 + new Date().getMinutes(); // rough — good enough

  for (const w of branch.serviceWindows) {
    if (!w.isActive) continue;
    const [sh, sm] = w.startTime.split(':').map(Number);
    const [eh, em] = w.endTime.split(':').map(Number);
    const start = sh * 60 + sm;
    const end   = eh * 60 + em;
    if (currentMinutes >= start && currentMinutes <= end) return w.name;
  }
  return null;
};

// ── GET /menu ──────────────────────────────────────────────────────────────────
const getMenuItems = async (req, res) => {
  try {
    // Auto-reset daily counts at midnight (fire-and-forget)
    const today = new Date(); today.setHours(0, 0, 0, 0);
    MenuItem.updateMany(
      { dailyLimit: { $gt: 0 }, dailySoldCount: { $gt: 0 }, dailyResetDate: { $lt: today } },
      { dailySoldCount: 0, dailyResetDate: today }
    ).catch(() => {});

    const { page, limit, skip, sort } = getPaginationParams(req.query);
    const { serviceWindow, isAvailable, search, franchiseId, branchId,
            isVeg, isBestseller, activeWindow } = req.query;
    // categoryId can be passed as a query param
    const categoryId = req.query.categoryId || req.query.category;

    const filter = { isDeleted: false };
    const conditions = [];

    if (req.user?.role !== 'system_admin' && req.user?.franchiseId) {
      filter.franchiseId = req.user.franchiseId;
    }
    if (franchiseId) filter.franchiseId = new mongoose.Types.ObjectId(franchiseId);

    // Branch-aware filter: isGlobal OR branchId match
    if (branchId) {
      conditions.push({
        $or: [
          { isGlobal: true },
          { branchId: new mongoose.Types.ObjectId(branchId) },
        ],
      });
    }

    // Category filter — accepts either an ObjectId string or a category name
    if (categoryId) {
      if (mongoose.Types.ObjectId.isValid(categoryId)) {
        filter.categoryId = new mongoose.Types.ObjectId(categoryId);
      } else {
        // Name-based lookup (e.g. "Beverages", "Breakfast")
        const cat = await MenuCategory.findOne({ name: categoryId, isDeleted: false }).select('_id').lean();
        if (cat) {
          filter.categoryId = cat._id;
        } else {
          // No matching category → return empty result
          return paginated(res, [], buildPaginationMeta(0, page, limit));
        }
      }
    }

    // Service window filter
    if (serviceWindow) {
      conditions.push({ serviceWindow: serviceWindow });
    }

    // Active window auto-filter: detect current IST window from branch
    if (activeWindow === 'true' && branchId) {
      const branch = await Branch.findById(branchId).select('serviceWindows').lean();
      const currentWindow = detectActiveWindow(branch);
      if (currentWindow) {
        conditions.push({ serviceWindow: currentWindow });
      }
    }

    if (isAvailable !== undefined) filter.isAvailable = isAvailable === 'true';
    if (isVeg !== undefined) filter.isVeg = isVeg === 'true';
    if (isBestseller === 'true') filter.isBestseller = true;

    if (search) {
      conditions.push({
        $or: [
          { name:        { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
          { itemCode:    { $regex: search, $options: 'i' } },
          { tags:        { $regex: search, $options: 'i' } },
        ],
      });
    }

    if (conditions.length > 0) filter.$and = conditions;

    const [items, total] = await Promise.all([
      MenuItem.find(filter)
        .populate(CATEGORY_POPULATE)
        .populate(BRANCH_POPULATE)
        .populate(FRANCHISE_POPULATE)
        .sort(sort)
        .skip(skip)
        .limit(limit),
      MenuItem.countDocuments(filter),
    ]);

    // Annotate with dailyLimitReached
    const annotated = items.map((item) => {
      const obj = item.toObject();
      if (item.dailyLimit > 0) {
        const resetDate = item.dailyResetDate ? new Date(item.dailyResetDate) : null;
        const stale = !resetDate || resetDate < today;
        const count = stale ? 0 : item.dailySoldCount;
        obj.dailyLimitReached = count >= item.dailyLimit;
        obj.remainingCount    = Math.max(0, item.dailyLimit - count);
      } else {
        obj.dailyLimitReached = false;
        obj.remainingCount    = -1;
      }
      return obj;
    });

    return paginated(res, annotated, buildPaginationMeta(total, page, limit));
  } catch (err) {
    console.error('Get menu items error:', err);
    return error(res, 'Failed to fetch menu items', 500);
  }
};

// ── GET /menu/active-window ────────────────────────────────────────────────────
// Returns the currently active service window for a branch (IST-based).
const getActiveWindow = async (req, res) => {
  try {
    const { branchId } = req.query;
    if (!branchId) return error(res, 'branchId is required', 400);

    const branch = await Branch.findById(branchId).select('serviceWindows workingHours').lean();
    if (!branch) return notFound(res, 'Branch not found');

    const activeWindowName = detectActiveWindow(branch);
    const istHour = getISTHour();

    // Find next upcoming window
    let nextWindow = null;
    if (!activeWindowName && branch.serviceWindows) {
      const now = istHour * 60 + new Date(new Date().getTime() + 5.5 * 60 * 60 * 1000).getMinutes();
      const sorted = branch.serviceWindows
        .filter(w => w.isActive)
        .sort((a, b) => {
          const [ah, am] = a.startTime.split(':').map(Number);
          const [bh, bm] = b.startTime.split(':').map(Number);
          return (ah * 60 + am) - (bh * 60 + bm);
        });
      nextWindow = sorted.find(w => {
        const [h, m] = w.startTime.split(':').map(Number);
        return h * 60 + m > now;
      }) || sorted[0]; // wrap to first window of day
    }

    return success(res, {
      activeWindow: activeWindowName,
      nextWindow: nextWindow ? { name: nextWindow.name, startTime: nextWindow.startTime } : null,
      allWindows: branch.serviceWindows || [],
      istHour,
    });
  } catch (err) {
    console.error('Active window error:', err);
    return error(res, 'Failed to detect active window', 500);
  }
};

// ── GET /menu/:id ─────────────────────────────────────────────────────────────
const getMenuItemById = async (req, res) => {
  try {
    const item = await MenuItem.findOne({ _id: req.params.id, isDeleted: false })
      .populate(CATEGORY_POPULATE)
      .populate(BRANCH_POPULATE)
      .populate(FRANCHISE_POPULATE);
    if (!item) return notFound(res, 'Menu item not found');

    // Increment view count (fire-and-forget)
    MenuItem.findByIdAndUpdate(req.params.id, { $inc: { viewCount: 1 } }).catch(() => {});

    return success(res, item);
  } catch (err) {
    console.error('Get menu item error:', err);
    return error(res, 'Failed to fetch menu item', 500);
  }
};

// ── POST /menu ────────────────────────────────────────────────────────────────
const createMenuItem = async (req, res) => {
  try {
    const franchiseId = req.body.franchiseId || req.user.franchiseId;
    const { branchId, name, description, price, tax,
            serviceWindow, preparationTime, displayOrder } = req.body;

    if (!franchiseId || !name || price === undefined) {
      return error(res, 'franchiseId, name, and price are required', 400);
    }

    // categoryId must be a valid ObjectId referencing a MenuCategory
    const categoryId = req.body.categoryId;
    if (!categoryId || !mongoose.Types.ObjectId.isValid(categoryId)) {
      return error(res, 'categoryId is required and must be a valid category ID', 400);
    }
    // Verify category exists and belongs to this franchise
    const cat = await MenuCategory.findOne({
      _id: categoryId, franchiseId, isDeleted: false,
    });
    if (!cat) return error(res, 'Category not found for this franchise', 404);

    const tags            = parseField(req.body.tags) || [];
    const allergens       = parseField(req.body.allergens) || [];
    const customProperties = parseField(req.body.customProperties) || [];
    const parsedServiceWindow = parseField(serviceWindow) || [];
    const addons          = parseField(req.body.addons) || [];

    const isVeg = req.body.isVeg !== undefined
      ? (req.body.isVeg === 'true' || req.body.isVeg === true)
      : tags.includes('Veg');

    const isGlobal = req.body.isGlobal !== undefined
      ? (req.body.isGlobal !== 'false' && req.body.isGlobal !== false)
      : true;

    const originalPrice = req.body.originalPrice !== undefined && req.body.originalPrice !== ''
      ? parseFloat(req.body.originalPrice) : null;

    // Images: existing (kept from edit) + new uploads, capped at 5
    const existingImages = parseField(req.body.existingImages) || [];
    const images = [...existingImages, ...(req.fileUrls || [])].slice(0, 5);

    const item = await MenuItem.create({
      franchiseId,
      branchId:     branchId || null,
      categoryId,
      name,
      description,
      price:          parseFloat(price),
      originalPrice,
      tax:            parseFloat(tax || 0),
      images,
      isVeg,
      isAvailable:    req.body.isAvailable !== false,
      isGlobal,
      isBestseller:   req.body.isBestseller === 'true' || req.body.isBestseller === true,
      isNew:          req.body.isNew === 'true' || req.body.isNew === true,
      isSpicy:        req.body.isSpicy === 'true' || req.body.isSpicy === true,
      spiceLevel:     parseInt(req.body.spiceLevel || 0),
      calories:       req.body.calories ? parseInt(req.body.calories) : null,
      preparationTime: parseInt(preparationTime || 10),
      displayOrder:   parseInt(displayOrder || 0),
      serviceWindow:  parsedServiceWindow,
      tags,
      allergens,
      customProperties,
      addons,
      dailyLimit:     parseInt(req.body.dailyLimit || 0),
      createdBy:      req.user._id,
    });

    const saved = await MenuItem.findById(item._id)
      .populate(CATEGORY_POPULATE)
      .populate(BRANCH_POPULATE)
      .populate(FRANCHISE_POPULATE);

    await AuditLog.create({
      action: 'CREATE', resource: 'menu', resourceId: item._id,
      resourceName: item.name, userId: req.user._id, userName: req.user.name,
      userRole: req.user.role, franchiseId: franchiseId || null, ip: req.ip || '',
    }).catch(() => {});

    return created(res, saved, 'Menu item created successfully');
  } catch (err) {
    console.error('Create menu item error:', err);
    return error(res, 'Failed to create menu item', 500);
  }
};

// ── PUT /menu/:id ─────────────────────────────────────────────────────────────
const updateMenuItem = async (req, res) => {
  try {
    const item = await MenuItem.findOne({ _id: req.params.id, isDeleted: false });
    if (!item) return notFound(res, 'Menu item not found');

    const scalarFields = [
      'name', 'description', 'price', 'tax', 'originalPrice',
      'preparationTime', 'displayOrder', 'isAvailable', 'branchId',
      'isGlobal', 'isVeg', 'isBestseller', 'isNew', 'isSpicy', 'spiceLevel',
      'calories', 'dailyLimit',
    ];
    const updates = { updatedBy: req.user._id };

    scalarFields.forEach((f) => {
      if (req.body[f] !== undefined) updates[f] = parseField(req.body[f]);
    });

    // categoryId update with validation
    if (req.body.categoryId && mongoose.Types.ObjectId.isValid(req.body.categoryId)) {
      const cat = await MenuCategory.findOne({
        _id: req.body.categoryId, isDeleted: false,
      });
      if (!cat) return error(res, 'Category not found', 404);
      updates.categoryId = req.body.categoryId;
    }

    if (req.body.serviceWindow !== undefined) {
      updates.serviceWindow = parseField(req.body.serviceWindow) || [];
    }
    if (req.body.tags !== undefined)            updates.tags = parseField(req.body.tags) || [];
    if (req.body.allergens !== undefined)        updates.allergens = parseField(req.body.allergens) || [];
    if (req.body.customProperties !== undefined) updates.customProperties = parseField(req.body.customProperties) || [];
    if (req.body.addons !== undefined)           updates.addons = parseField(req.body.addons) || [];

    // Images
    if (req.body.existingImages !== undefined || (req.fileUrls && req.fileUrls.length > 0)) {
      const kept = parseField(req.body.existingImages) || [];
      updates.images = [...kept, ...(req.fileUrls || [])].slice(0, 5);
    }

    const updated = await MenuItem.findByIdAndUpdate(
      req.params.id, updates, { new: true, runValidators: true }
    )
      .populate(CATEGORY_POPULATE)
      .populate(BRANCH_POPULATE)
      .populate(FRANCHISE_POPULATE);

    return success(res, updated, 'Menu item updated successfully');
  } catch (err) {
    console.error('Update menu item error:', err);
    return error(res, 'Failed to update menu item', 500);
  }
};

// ── DELETE /menu/:id ──────────────────────────────────────────────────────────
const deleteMenuItem = async (req, res) => {
  try {
    const item = await MenuItem.findOne({ _id: req.params.id, isDeleted: false });
    if (!item) return notFound(res, 'Menu item not found');
    await MenuItem.findByIdAndUpdate(req.params.id, { isDeleted: true, updatedBy: req.user._id });
    return success(res, null, 'Menu item deleted');
  } catch (err) {
    return error(res, 'Failed to delete menu item', 500);
  }
};

// ── PATCH /menu/:id/toggle ────────────────────────────────────────────────────
const toggleAvailability = async (req, res) => {
  try {
    const item = await MenuItem.findOne({ _id: req.params.id, isDeleted: false });
    if (!item) return notFound(res, 'Menu item not found');
    const updated = await MenuItem.findByIdAndUpdate(
      req.params.id,
      { isAvailable: !item.isAvailable, updatedBy: req.user._id },
      { new: true }
    ).populate(CATEGORY_POPULATE);
    return success(res, updated, `Item ${updated.isAvailable ? 'available' : 'unavailable'}`);
  } catch (err) {
    return error(res, 'Failed to toggle availability', 500);
  }
};

// ── POST /menu/bulk-availability ──────────────────────────────────────────────
const bulkUpdateAvailability = async (req, res) => {
  try {
    const { ids, isAvailable } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return error(res, 'ids array is required', 400);
    }
    await MenuItem.updateMany(
      { _id: { $in: ids }, isDeleted: false },
      { isAvailable: Boolean(isAvailable), updatedBy: req.user._id }
    );
    return success(res, { updatedCount: ids.length }, 'Bulk availability updated');
  } catch (err) {
    return error(res, 'Failed to bulk update', 500);
  }
};

// ── POST /menu/:id/reset-daily ─────────────────────────────────────────────────
const resetDailyCount = async (req, res) => {
  try {
    const item = await MenuItem.findByIdAndUpdate(
      req.params.id,
      { dailySoldCount: 0, dailyResetDate: new Date() },
      { new: true }
    );
    if (!item) return notFound(res, 'Menu item not found');
    return success(res, item, 'Daily count reset');
  } catch (err) {
    return error(res, 'Failed to reset', 500);
  }
};

// ── GET /menu/top-performers ───────────────────────────────────────────────────
const getTopPerformers = async (req, res) => {
  try {
    const { franchiseId, branchId, limit = 10, period = 'today' } = req.query;

    const now = new Date();
    const dateFilter =
      period === 'today' ? new Date(now.getFullYear(), now.getMonth(), now.getDate())
      : period === 'week'  ? new Date(now - 7 * 24 * 60 * 60 * 1000)
      : period === 'month' ? new Date(now.getFullYear(), now.getMonth(), 1)
      : new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const Order = require('../models/Order');
    const matchFilter = { createdAt: { $gte: dateFilter }, status: { $nin: ['cancelled'] } };
    if (franchiseId) matchFilter.franchiseId = new mongoose.Types.ObjectId(franchiseId);
    if (branchId)    matchFilter.branchId    = new mongoose.Types.ObjectId(branchId);

    const topItems = await Order.aggregate([
      { $match: matchFilter },
      { $unwind: '$items' },
      {
        $group: {
          _id:       '$items.menuItemId',
          name:      { $first: '$items.name' },
          soldCount: { $sum: '$items.quantity' },
          revenue:   { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
        },
      },
      { $sort: { soldCount: -1 } },
      { $limit: parseInt(limit) },
    ]);

    return success(res, topItems);
  } catch (err) {
    console.error('Top performers error:', err);
    return error(res, 'Failed to fetch top performers', 500);
  }
};

// ── GET /menu/recommendations ──────────────────────────────────────────────────
// Smart ranking: IST-aware (boosts current-window items) + rating + popularity
const getRecommendations = async (req, res) => {
  try {
    const { branchId, franchiseId, serviceWindow } = req.query;
    const limit = Math.min(parseInt(req.query.limit || 8), 20);

    const filter = { isDeleted: false, isAvailable: true };
    if (req.user?.role !== 'system_admin' && req.user?.franchiseId) {
      filter.franchiseId = req.user.franchiseId;
    }
    if (franchiseId) filter.franchiseId = new mongoose.Types.ObjectId(franchiseId);
    if (branchId) {
      filter.$or = [
        { isGlobal: true },
        { branchId: new mongoose.Types.ObjectId(branchId) },
      ];
    }

    // Filter to the requested service window (MongoDB array contains check).
    // This covers items available in the specific window AND items available
    // in multiple windows (e.g. ["Breakfast","Lunch"]) — nothing is missed.
    if (serviceWindow) {
      filter.serviceWindow = serviceWindow;
    }

    // Detect current IST window for this branch (used for scoring boost)
    let currentWindow = serviceWindow || null;
    if (!currentWindow && branchId) {
      const branch = await Branch.findById(branchId).select('serviceWindows').lean();
      currentWindow = detectActiveWindow(branch);
    }

    // Over-fetch to allow scoring
    const items = await MenuItem.find(filter)
      .populate(CATEGORY_POPULATE)
      .sort({ 'ratings.average': -1, orderCount: -1 })
      .limit(limit * 4);

    const maxRating    = 5;
    const maxOrders    = Math.max(...items.map(i => i.orderCount || 0), 1);
    const maxViews     = Math.max(...items.map(i => i.viewCount  || 0), 1);

    const scored = items
      .map(item => {
        const r  = (item.ratings?.average || 0) / maxRating;
        const o  = (item.orderCount || 0) / maxOrders;
        const v  = (item.viewCount  || 0) / maxViews;
        // Boost items in the current active service window
        const windowBoost = currentWindow && item.serviceWindow?.includes(currentWindow) ? 0.25 : 0;
        // Boost bestsellers and new items
        const flagBoost   = (item.isBestseller ? 0.1 : 0) + (item.isNew ? 0.05 : 0);
        return { item, score: 0.45 * r + 0.3 * o + 0.1 * v + windowBoost + flagBoost };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ item }) => item.toObject());

    return success(res, { items: scored, activeWindow: currentWindow });
  } catch (err) {
    console.error('Recommendations error:', err);
    return error(res, 'Failed to fetch recommendations', 500);
  }
};

// ── GET /menu/overrides/:id ────────────────────────────────────────────────────
const getBranchOverrides = async (req, res) => {
  try {
    const overrides = await BranchMenuOverride.find({ menuItemId: req.params.id })
      .populate('branchId', 'name code');
    return success(res, overrides);
  } catch (err) {
    return error(res, 'Failed to fetch overrides', 500);
  }
};

// ── POST /menu/:id/link-branch ─────────────────────────────────────────────────
const linkToBranch = async (req, res) => {
  try {
    const item = await MenuItem.findOne({ _id: req.params.id, isDeleted: false });
    if (!item) return notFound(res, 'Menu item not found');

    const { branchId, priceOverride, serviceWindowOverride, dailyLimitOverride } = req.body;
    if (!branchId) return error(res, 'branchId is required', 400);

    const override = await BranchMenuOverride.findOneAndUpdate(
      { menuItemId: item._id, branchId },
      {
        $set: {
          menuItemId: item._id, franchiseId: item.franchiseId, branchId, isLinked: true,
          ...(priceOverride !== undefined && { priceOverride: priceOverride || null }),
          ...(serviceWindowOverride !== undefined && { serviceWindowOverride: serviceWindowOverride || null }),
          ...(dailyLimitOverride !== undefined && { dailyLimitOverride: dailyLimitOverride || null }),
        },
      },
      { upsert: true, new: true }
    );
    return success(res, override, 'Item linked to branch');
  } catch (err) {
    return error(res, 'Failed to link branch', 500);
  }
};

// ── DELETE /menu/:id/link-branch/:branchId ────────────────────────────────────
const unlinkFromBranch = async (req, res) => {
  try {
    const { id, branchId } = req.params;
    await BranchMenuOverride.findOneAndDelete({ menuItemId: id, branchId });
    return success(res, null, 'Item unlinked from branch');
  } catch (err) {
    return error(res, 'Failed to unlink', 500);
  }
};

// ── GET /menu/:id/ratings ─────────────────────────────────────────────────────
// Returns the aggregated rating summary + paginated feedback history for one item.
const getMenuItemRatings = async (req, res) => {
  try {
    const Feedback = require('../models/Feedback');
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const item = await MenuItem.findOne({ _id: req.params.id, isDeleted: false })
      .select('name ratings');
    if (!item) return notFound(res, 'Menu item not found');

    const filter = { menuItemIds: item._id };

    const [feedbacks, total] = await Promise.all([
      Feedback.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .select('rating comment category customerName isAnonymous createdAt orderId')
        .populate('orderId', 'tokenNumber'),
      Feedback.countDocuments(filter),
    ]);

    return success(res, {
      summary: {
        average: item.ratings.average,
        count:   item.ratings.count,
        total:   item.ratings.total,
      },
      feedbacks,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error('Get item ratings error:', err);
    return error(res, 'Failed to fetch ratings', 500);
  }
};

module.exports = {
  getMenuItems,
  getActiveWindow,
  getMenuItemById,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  toggleAvailability,
  bulkUpdateAvailability,
  linkToBranch,
  unlinkFromBranch,
  getBranchOverrides,
  resetDailyCount,
  getTopPerformers,
  getRecommendations,
  getMenuItemRatings,
};
