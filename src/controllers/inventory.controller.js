const Inventory = require('../models/Inventory');
const StockMovement = require('../models/StockMovement');
const InventoryCategory = require('../models/InventoryCategory');
const InventoryLot = require('../models/InventoryLot');
const { getPaginationParams, buildPaginationMeta } = require('../utils/pagination');
const { success, created, paginated, error, notFound } = require('../utils/apiResponse');

const buildFilter = (req) => {
  const filter = { isDeleted: false };
  if (req.user.role !== 'system_admin' && req.user.franchiseId) {
    filter.franchiseId = req.user.franchiseId;
  }
  return filter;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Consume qty from active lots for an item using FIFO (oldest purchase first)
const consumeLotsFirefirst = async (itemId, qty) => {
  let remaining = qty;
  const lots = await InventoryLot.find({ itemId, isActive: true, isDeleted: false })
    .sort({ purchaseDate: 1 });

  for (const lot of lots) {
    if (remaining <= 0) break;
    const consume = Math.min(lot.quantityRemaining, remaining);
    lot.quantityRemaining -= consume;
    if (lot.quantityRemaining <= 0) {
      lot.quantityRemaining = 0;
      lot.isActive = false;
    }
    await lot.save();
    remaining -= consume;
  }
};

// GET /inventory
const getInventory = async (req, res) => {
  try {
    const { page, limit, skip, sort } = getPaginationParams(req.query);
    const { categoryId, stockStatus, search, franchiseId, branchId, expiry } = req.query;

    const filter = buildFilter(req);
    if (franchiseId) filter.franchiseId = franchiseId;
    if (branchId) filter.branchId = branchId;
    if (categoryId) filter.categoryId = categoryId;

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { supplier: { $regex: search, $options: 'i' } },
        { categoryName: { $regex: search, $options: 'i' } },
        { batchNo: { $regex: search, $options: 'i' } },
      ];
    }

    if (expiry === 'expired') {
      filter.expiryDate = { $lt: new Date() };
    } else if (expiry === 'near') {
      const week = new Date();
      week.setDate(week.getDate() + 7);
      filter.expiryDate = { $gte: new Date(), $lte: week };
    }

    let items, total;

    if (stockStatus === 'low') {
      const pipeline = [
        { $match: filter },
        { $match: { $expr: { $and: [
          { $lte: ['$currentStock', { $ifNull: ['$alertThreshold', '$minStock'] }] },
          { $gt: ['$currentStock', { $multiply: [{ $ifNull: ['$alertThreshold', '$minStock'] }, 0.3] }] },
        ] } } },
      ];
      const [countResult, results] = await Promise.all([
        Inventory.aggregate([...pipeline, { $count: 'total' }]),
        Inventory.aggregate([...pipeline, { $sort: { currentStock: 1 } }, { $skip: skip }, { $limit: limit }]),
      ]);
      total = countResult[0]?.total || 0;
      items = results;
    } else if (stockStatus === 'critical') {
      const pipeline = [
        { $match: filter },
        { $match: { $expr: { $lte: ['$currentStock', { $multiply: [{ $ifNull: ['$alertThreshold', '$minStock'] }, 0.3] }] } } },
      ];
      const [countResult, results] = await Promise.all([
        Inventory.aggregate([...pipeline, { $count: 'total' }]),
        Inventory.aggregate([...pipeline, { $sort: { currentStock: 1 } }, { $skip: skip }, { $limit: limit }]),
      ]);
      total = countResult[0]?.total || 0;
      items = results;
    } else {
      [items, total] = await Promise.all([
        Inventory.find(filter).sort(sort).skip(skip).limit(limit),
        Inventory.countDocuments(filter),
      ]);
    }

    return paginated(res, items, buildPaginationMeta(total, page, limit));
  } catch (err) {
    console.error('Get inventory error:', err);
    return error(res, 'Failed to fetch inventory', 500);
  }
};

// GET /inventory/:id
const getInventoryById = async (req, res) => {
  try {
    const item = await Inventory.findOne({ _id: req.params.id, isDeleted: false });
    if (!item) return notFound(res, 'Inventory item not found');
    return success(res, item);
  } catch (err) {
    console.error('Get inventory item error:', err);
    return error(res, 'Failed to fetch inventory item', 500);
  }
};

// POST /inventory
const createInventoryItem = async (req, res) => {
  try {
    const {
      franchiseId, branchId, categoryId, name, unit,
      currentStock, minStock, maxStock, alertThreshold,
      costPerUnit, supplier, expiryDate, batchNo,
    } = req.body;
    if (!name) return error(res, 'Name is required', 400);

    // Resolve category name for denormalization
    let categoryName = '';
    if (categoryId) {
      const cat = await InventoryCategory.findById(categoryId);
      if (cat) categoryName = cat.name;
    }

    const resolvedFranchiseId = franchiseId || req.user.franchiseId || null;
    if (!resolvedFranchiseId) {
      return error(res, 'franchiseId is required. System admins must specify which franchise this item belongs to.', 400);
    }
    const initialQty = parseFloat(currentStock || 0);

    const item = await Inventory.create({
      franchiseId: resolvedFranchiseId,
      branchId: branchId || req.user.branchId || null,
      categoryId: categoryId || null,
      categoryName,
      name,
      unit: unit || 'kg',
      currentStock: initialQty,
      minStock: parseFloat(minStock || 10),
      maxStock: parseFloat(maxStock || 100),
      alertThreshold: alertThreshold != null ? parseFloat(alertThreshold) : null,
      costPerUnit: parseFloat(costPerUnit || 0),
      supplier: supplier || '',
      image: req.fileUrl || '',
      expiryDate: expiryDate || null,
      batchNo: batchNo || '',
      lastRestocked: initialQty > 0 ? new Date() : undefined,
    });

    // Record INITIAL stock movement
    const movement = await StockMovement.create({
      itemId: item._id,
      itemName: item.name,
      franchiseId: resolvedFranchiseId,
      branchId: item.branchId,
      type: 'INITIAL',
      quantity: initialQty,
      stockBefore: 0,
      stockAfter: initialQty,
      reason: 'Initial stock entry',
      unitPrice: parseFloat(costPerUnit || 0),
      performedBy: req.user._id,
      performedByName: req.user.name || '',
    });

    // Create an initial lot if stock > 0
    if (initialQty > 0) {
      await InventoryLot.create({
        itemId: item._id,
        itemName: item.name,
        franchiseId: resolvedFranchiseId,
        branchId: item.branchId,
        supplier: { name: supplier || '' },
        purchaseDate: new Date(),
        unitPrice: parseFloat(costPerUnit || 0),
        quantityPurchased: initialQty,
        quantityRemaining: initialQty,
        batchNo: batchNo || '',
        expiryDate: expiryDate || null,
        movementId: movement._id,
      });
    }

    return created(res, item, 'Inventory item created');
  } catch (err) {
    console.error('Create inventory error:', err);
    return error(res, 'Failed to create inventory item', 500);
  }
};

// PUT /inventory/:id
const updateInventoryItem = async (req, res) => {
  try {
    const item = await Inventory.findOne({ _id: req.params.id, isDeleted: false });
    if (!item) return notFound(res, 'Inventory item not found');

    const allowed = ['name', 'unit', 'minStock', 'maxStock', 'alertThreshold', 'costPerUnit', 'supplier', 'expiryDate', 'batchNo'];
    const updates = {};
    allowed.forEach((f) => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    if (req.fileUrl) updates.image = req.fileUrl;

    // Handle categoryId update with denormalization
    if (req.body.categoryId !== undefined) {
      updates.categoryId = req.body.categoryId || null;
      if (req.body.categoryId) {
        const cat = await InventoryCategory.findById(req.body.categoryId);
        updates.categoryName = cat ? cat.name : '';
      } else {
        updates.categoryName = '';
      }
    }

    const updated = await Inventory.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    return success(res, updated, 'Inventory item updated');
  } catch (err) {
    console.error('Update inventory error:', err);
    return error(res, 'Failed to update inventory item', 500);
  }
};

// DELETE /inventory/:id
const deleteInventoryItem = async (req, res) => {
  try {
    const item = await Inventory.findOne({ _id: req.params.id, isDeleted: false });
    if (!item) return notFound(res, 'Inventory item not found');
    await Inventory.findByIdAndUpdate(req.params.id, { isDeleted: true });
    return success(res, null, 'Inventory item deleted');
  } catch (err) {
    console.error('Delete inventory error:', err);
    return error(res, 'Failed to delete inventory item', 500);
  }
};

// POST /inventory/:id/adjust  — handles STOCK_IN, STOCK_OUT, ADJUSTMENT, EXPIRED, DAMAGED
const adjustStock = async (req, res) => {
  try {
    const { type, quantity, reason, supplier, unitPrice, notes } = req.body;

    if (!type) return error(res, 'Movement type is required', 400);
    if (!quantity || parseFloat(quantity) <= 0) return error(res, 'Quantity must be positive', 400);

    const validTypes = ['STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT', 'EXPIRED', 'DAMAGED'];
    if (!validTypes.includes(type)) return error(res, `Invalid type. Use: ${validTypes.join(', ')}`, 400);

    // Require reason for reductions
    if (['STOCK_OUT', 'ADJUSTMENT', 'EXPIRED', 'DAMAGED'].includes(type) && !reason) {
      return error(res, 'Reason is required for stock reductions', 400);
    }

    const item = await Inventory.findOne({ _id: req.params.id, isDeleted: false });
    if (!item) return notFound(res, 'Inventory item not found');

    const qty = parseFloat(quantity);
    const isAddition = type === 'STOCK_IN';
    const newStock = isAddition ? item.currentStock + qty : Math.max(0, item.currentStock - qty);

    const movement = await StockMovement.create({
      itemId: item._id,
      itemName: item.name,
      franchiseId: item.franchiseId,
      branchId: item.branchId,
      type,
      quantity: qty,
      stockBefore: item.currentStock,
      stockAfter: newStock,
      reason: reason || '',
      supplier: supplier || {},
      unitPrice: parseFloat(unitPrice || 0),
      performedBy: req.user._id,
      performedByName: req.user.name || '',
      notes: notes || '',
      attachments: req.fileUrls || [],
    });

    // Lot tracking
    if (isAddition) {
      // Create a new lot for this purchase
      await InventoryLot.create({
        itemId: item._id,
        itemName: item.name,
        franchiseId: item.franchiseId,
        branchId: item.branchId,
        supplier: supplier || {},
        purchaseDate: new Date(),
        unitPrice: parseFloat(unitPrice || 0),
        quantityPurchased: qty,
        quantityRemaining: qty,
        batchNo: req.body.batchNo || item.batchNo || '',
        expiryDate: req.body.expiryDate || null,
        movementId: movement._id,
      });
    } else {
      // Consume from active lots FIFO
      await consumeLotsFirefirst(item._id, qty);
    }

    const itemUpdates = { currentStock: newStock };
    if (isAddition) {
      itemUpdates.lastRestocked = new Date();
      if (unitPrice) itemUpdates.costPerUnit = parseFloat(unitPrice);
      if (supplier?.name) itemUpdates.supplier = supplier.name;
    }

    const updated = await Inventory.findByIdAndUpdate(req.params.id, itemUpdates, { new: true });

    const threshold = updated.alertThreshold != null ? updated.alertThreshold : updated.minStock;
    const alertFired = newStock <= threshold;

    return success(res, { item: updated, movement, alertFired }, `Stock adjusted: ${type}`);
  } catch (err) {
    console.error('Adjust stock error:', err);
    return error(res, 'Failed to adjust stock', 500);
  }
};

// Backward-compat alias kept for existing clients
const restockItem = async (req, res) => {
  req.body.type = 'STOCK_IN';
  return adjustStock(req, res);
};

// GET /inventory/:id/lots — supplier lot breakdown for one item
const getItemLots = async (req, res) => {
  try {
    const { includeConsumed } = req.query;
    const filter = { itemId: req.params.id, isDeleted: false };
    if (!includeConsumed) filter.isActive = true;

    const lots = await InventoryLot.find(filter).sort({ purchaseDate: -1 });

    // Aggregate per-supplier summary (active lots only)
    const supplierSummary = await InventoryLot.aggregate([
      { $match: { itemId: new (require('mongoose').Types.ObjectId)(req.params.id), isDeleted: false, isActive: true } },
      {
        $group: {
          _id: '$supplier.name',
          supplierName: { $first: '$supplier.name' },
          totalRemaining: { $sum: '$quantityRemaining' },
          totalPurchased: { $sum: '$quantityPurchased' },
          avgUnitPrice: { $avg: '$unitPrice' },
          lotCount: { $sum: 1 },
          latestPurchase: { $max: '$purchaseDate' },
        },
      },
      { $sort: { totalRemaining: -1 } },
    ]);

    return success(res, { lots, supplierSummary });
  } catch (err) {
    console.error('Get item lots error:', err);
    return error(res, 'Failed to fetch item lots', 500);
  }
};

// GET /inventory/movements — overall history with filters
const getMovements = async (req, res) => {
  try {
    const { page, limit, skip } = getPaginationParams(req.query);
    const { itemId, type, franchiseId, branchId, from, to } = req.query;

    const filter = {};
    if (req.user.role !== 'system_admin' && req.user.franchiseId) {
      filter.franchiseId = req.user.franchiseId;
    }
    if (franchiseId) filter.franchiseId = franchiseId;
    if (branchId) filter.branchId = branchId;
    if (itemId) filter.itemId = itemId;
    if (type) filter.type = type;
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }

    const [movements, total] = await Promise.all([
      StockMovement.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      StockMovement.countDocuments(filter),
    ]);

    return paginated(res, movements, buildPaginationMeta(total, page, limit));
  } catch (err) {
    console.error('Get movements error:', err);
    return error(res, 'Failed to fetch stock movements', 500);
  }
};

// GET /inventory/:id/movements — movements for a single item
const getItemMovements = async (req, res) => {
  try {
    const { page, limit, skip } = getPaginationParams(req.query);
    const { type, from, to } = req.query;

    const filter = { itemId: req.params.id };
    if (type) filter.type = type;
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }

    const [movements, total] = await Promise.all([
      StockMovement.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      StockMovement.countDocuments(filter),
    ]);

    return paginated(res, movements, buildPaginationMeta(total, page, limit));
  } catch (err) {
    console.error('Get item movements error:', err);
    return error(res, 'Failed to fetch item movements', 500);
  }
};

// GET /inventory/low-stock
const getLowStockItems = async (req, res) => {
  try {
    const filter = buildFilter(req);
    if (req.query.franchiseId) filter.franchiseId = req.query.franchiseId;
    if (req.query.branchId) filter.branchId = req.query.branchId;

    const items = await Inventory.aggregate([
      { $match: filter },
      { $match: { $expr: { $lte: ['$currentStock', { $ifNull: ['$alertThreshold', '$minStock'] }] } } },
      { $sort: { currentStock: 1 } },
      { $limit: 100 },
    ]);

    return success(res, items, `${items.length} low stock item(s) found`);
  } catch (err) {
    console.error('Low stock error:', err);
    return error(res, 'Failed to fetch low stock items', 500);
  }
};

// GET /inventory/stats — summary stats
const getInventoryStats = async (req, res) => {
  try {
    const filter = buildFilter(req);
    if (req.query.franchiseId) filter.franchiseId = req.query.franchiseId;
    if (req.query.branchId) filter.branchId = req.query.branchId;

    const stats = await Inventory.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalItems: { $sum: 1 },
          totalValue: { $sum: { $multiply: ['$currentStock', '$costPerUnit'] } },
          lowCount: {
            $sum: {
              $cond: [
                { $and: [
                  { $lte: ['$currentStock', { $ifNull: ['$alertThreshold', '$minStock'] }] },
                  { $gt: ['$currentStock', { $multiply: [{ $ifNull: ['$alertThreshold', '$minStock'] }, 0.3] }] },
                ] },
                1, 0,
              ]
            }
          },
          criticalCount: {
            $sum: {
              $cond: [
                { $lte: ['$currentStock', { $multiply: [{ $ifNull: ['$alertThreshold', '$minStock'] }, 0.3] }] },
                1, 0,
              ]
            }
          },
          outOfStockCount: {
            $sum: { $cond: [{ $eq: ['$currentStock', 0] }, 1, 0] }
          },
          nearExpiryCount: {
            $sum: {
              $cond: [
                { $and: [
                  { $ne: ['$expiryDate', null] },
                  { $gte: ['$expiryDate', new Date()] },
                  { $lte: ['$expiryDate', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)] },
                ] },
                1, 0,
              ]
            }
          },
        }
      }
    ]);

    return success(res, stats[0] || { totalItems: 0, totalValue: 0, lowCount: 0, criticalCount: 0, outOfStockCount: 0, nearExpiryCount: 0 });
  } catch (err) {
    console.error('Inventory stats error:', err);
    return error(res, 'Failed to fetch inventory stats', 500);
  }
};

// GET /inventory/categories/stats — per-category health breakdown
const getCategoryStats = async (req, res) => {
  try {
    const filter = buildFilter(req);
    if (req.query.franchiseId) filter.franchiseId = req.query.franchiseId;
    if (req.query.branchId) filter.branchId = req.query.branchId;

    const week = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const rows = await Inventory.aggregate([
      { $match: filter },
      {
        $group: {
          _id: { id: '$categoryId', name: '$categoryName' },
          total: { $sum: 1 },
          totalValue: { $sum: { $multiply: ['$currentStock', '$costPerUnit'] } },
          outOfStockCount: { $sum: { $cond: [{ $eq: ['$currentStock', 0] }, 1, 0] } },
          criticalCount: {
            $sum: {
              $cond: [
                { $and: [
                  { $gt: ['$currentStock', 0] },
                  { $lte: ['$currentStock', { $multiply: [{ $ifNull: ['$alertThreshold', '$minStock'] }, 0.3] }] },
                ] },
                1, 0,
              ]
            }
          },
          lowCount: {
            $sum: {
              $cond: [
                { $and: [
                  { $gt: ['$currentStock', { $multiply: [{ $ifNull: ['$alertThreshold', '$minStock'] }, 0.3] }] },
                  { $lte: ['$currentStock', { $ifNull: ['$alertThreshold', '$minStock'] }] },
                ] },
                1, 0,
              ]
            }
          },
          nearExpiryCount: {
            $sum: {
              $cond: [
                { $and: [
                  { $ne: ['$expiryDate', null] },
                  { $gte: ['$expiryDate', new Date()] },
                  { $lte: ['$expiryDate', week] },
                ] },
                1, 0,
              ]
            }
          },
        }
      },
      {
        $project: {
          _id: 0,
          categoryId: '$_id.id',
          categoryName: '$_id.name',
          total: 1, totalValue: 1,
          outOfStockCount: 1, criticalCount: 1, lowCount: 1, nearExpiryCount: 1,
        }
      },
      { $sort: { categoryName: 1 } },
    ]);

    return success(res, rows);
  } catch (err) {
    console.error('Category stats error:', err);
    return error(res, 'Failed to fetch category stats', 500);
  }
};

// GET /inventory/analytics/velocity — movement velocity per item (avg daily consumption)
// Returns top fast movers, top slow movers, and movement type breakdown
const getVelocityAnalytics = async (req, res) => {
  try {
    const { franchiseId, branchId, categoryId, days = 30 } = req.query;
    const filter = buildFilter(req);
    if (franchiseId) filter.franchiseId = franchiseId;
    if (branchId) filter.branchId = branchId;
    if (categoryId) filter.categoryId = categoryId;

    const since = new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000);

    // Movement aggregation per item over the period
    const movFilter = { createdAt: { $gte: since } };
    if (filter.franchiseId) movFilter.franchiseId = filter.franchiseId;
    if (branchId) movFilter.branchId = branchId;

    const velocities = await StockMovement.aggregate([
      { $match: { ...movFilter, type: { $in: ['STOCK_OUT', 'EXPIRED', 'DAMAGED'] } } },
      {
        $group: {
          _id: '$itemId',
          itemName: { $first: '$itemName' },
          totalConsumed: { $sum: '$quantity' },
          movementCount: { $sum: 1 },
          outCount:     { $sum: { $cond: [{ $eq: ['$type', 'STOCK_OUT'] },  1, 0] } },
          expiredCount: { $sum: { $cond: [{ $eq: ['$type', 'EXPIRED'] },    1, 0] } },
          damagedCount: { $sum: { $cond: [{ $eq: ['$type', 'DAMAGED'] },    1, 0] } },
          expiredQty:   { $sum: { $cond: [{ $eq: ['$type', 'EXPIRED'] },    '$quantity', 0] } },
          damagedQty:   { $sum: { $cond: [{ $eq: ['$type', 'DAMAGED'] },    '$quantity', 0] } },
          consumedQty:  { $sum: { $cond: [{ $eq: ['$type', 'STOCK_OUT'] },  '$quantity', 0] } },
        },
      },
      {
        $addFields: {
          avgDailyConsumption: { $divide: ['$totalConsumed', parseInt(days)] },
          wasteQty: { $add: ['$expiredQty', '$damagedQty'] },
        },
      },
      { $sort: { totalConsumed: -1 } },
    ]);

    // Also get STOCK_IN per item to show purchase velocity
    const inVelocities = await StockMovement.aggregate([
      { $match: { ...movFilter, type: 'STOCK_IN' } },
      {
        $group: {
          _id: '$itemId',
          totalIn: { $sum: '$quantity' },
          purchaseCount: { $sum: 1 },
          totalCost: { $sum: { $multiply: ['$quantity', { $ifNull: ['$unitPrice', 0] }] } },
          supplierNames: { $addToSet: '$supplier.name' },
        },
      },
    ]);

    // Merge in-map for quick lookup
    const inMap = {};
    for (const r of inVelocities) inMap[r._id.toString()] = r;

    const merged = velocities.map((v) => {
      const inData = inMap[v._id.toString()] || {};
      return {
        ...v,
        totalIn: inData.totalIn || 0,
        purchaseCount: inData.purchaseCount || 0,
        totalCost: inData.totalCost || 0,
        supplierNames: (inData.supplierNames || []).filter(Boolean),
      };
    });

    const fastMovers = merged.slice(0, 10);
    const slowMovers = [...merged].sort((a, b) => a.totalConsumed - b.totalConsumed).slice(0, 10);

    // Overall movement type breakdown for this period
    const typeBreakdown = await StockMovement.aggregate([
      { $match: movFilter },
      { $group: { _id: '$type', count: { $sum: 1 }, totalQty: { $sum: '$quantity' } } },
    ]);

    return success(res, {
      period: { days: parseInt(days), since },
      fastMovers,
      slowMovers,
      typeBreakdown,
    });
  } catch (err) {
    console.error('Velocity analytics error:', err);
    return error(res, 'Failed to fetch velocity analytics', 500);
  }
};

module.exports = {
  getInventory, getInventoryById,
  createInventoryItem, updateInventoryItem, deleteInventoryItem,
  adjustStock, restockItem,
  getMovements, getItemMovements, getItemLots,
  getLowStockItems, getInventoryStats, getCategoryStats,
  getVelocityAnalytics,
};
