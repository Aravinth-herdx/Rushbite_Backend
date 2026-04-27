const Promotion = require('../models/Promotion');
const { getPaginationParams, buildPaginationMeta } = require('../utils/pagination');
const { success, created, paginated, error, notFound } = require('../utils/apiResponse');

// GET /promotions
const getPromotions = async (req, res) => {
  try {
    const { page, limit, skip, sort } = getPaginationParams(req.query);
    const { isActive, expired, franchiseId } = req.query;

    const filter = { isDeleted: false };
    if (req.user.role !== 'system_admin' && req.user.franchiseId) {
      filter.franchiseId = req.user.franchiseId;
    }
    if (franchiseId) filter.franchiseId = franchiseId;
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    if (expired === 'true') filter.validUntil = { $lt: new Date() };
    if (expired === 'false') filter.validUntil = { $gte: new Date() };

    const [promotions, total] = await Promise.all([
      Promotion.find(filter).sort(sort).skip(skip).limit(limit),
      Promotion.countDocuments(filter),
    ]);

    return paginated(res, promotions, buildPaginationMeta(total, page, limit));
  } catch (err) {
    console.error('Get promotions error:', err);
    return error(res, 'Failed to fetch promotions', 500);
  }
};

// GET /promotions/:id
const getPromotionById = async (req, res) => {
  try {
    const promo = await Promotion.findOne({ _id: req.params.id, isDeleted: false });
    if (!promo) return notFound(res, 'Promotion not found');
    return success(res, promo);
  } catch (err) {
    console.error('Get promotion error:', err);
    return error(res, 'Failed to fetch promotion', 500);
  }
};

// POST /promotions
const createPromotion = async (req, res) => {
  try {
    const { franchiseId, code, title, description, discountType, discountValue, maxDiscount, minOrderValue, validFrom, validUntil, usageLimit, applicableWindow, applicableItems } = req.body;
    if (!code || !title || !discountType || discountValue === undefined) {
      return error(res, 'code, title, discountType, and discountValue are required', 400);
    }

    const promo = await Promotion.create({
      franchiseId: franchiseId || req.user.franchiseId,
      code: code.toUpperCase(), title, description, discountType,
      discountValue: parseFloat(discountValue),
      maxDiscount: parseFloat(maxDiscount || 0),
      minOrderValue: parseFloat(minOrderValue || 0),
      validFrom: validFrom ? new Date(validFrom) : new Date(),
      validUntil: validUntil ? new Date(validUntil) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      usageLimit: parseInt(usageLimit || 0),
      applicableWindow: applicableWindow || [],
      applicableItems: applicableItems || [],
    });

    return created(res, promo, 'Promotion created successfully');
  } catch (err) {
    console.error('Create promotion error:', err);
    return error(res, 'Failed to create promotion', 500);
  }
};

// PUT /promotions/:id
const updatePromotion = async (req, res) => {
  try {
    const promo = await Promotion.findOne({ _id: req.params.id, isDeleted: false });
    if (!promo) return notFound(res, 'Promotion not found');

    const allowedFields = ['title', 'description', 'discountType', 'discountValue', 'maxDiscount', 'minOrderValue', 'validFrom', 'validUntil', 'usageLimit', 'applicableWindow', 'applicableItems', 'isActive'];
    const updates = {};
    allowedFields.forEach((f) => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

    const updated = await Promotion.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    return success(res, updated, 'Promotion updated');
  } catch (err) {
    console.error('Update promotion error:', err);
    return error(res, 'Failed to update promotion', 500);
  }
};

// DELETE /promotions/:id
const deletePromotion = async (req, res) => {
  try {
    const promo = await Promotion.findOne({ _id: req.params.id, isDeleted: false });
    if (!promo) return notFound(res, 'Promotion not found');
    await Promotion.findByIdAndUpdate(req.params.id, { isDeleted: true });
    return success(res, null, 'Promotion deleted');
  } catch (err) {
    console.error('Delete promotion error:', err);
    return error(res, 'Failed to delete promotion', 500);
  }
};

// POST /promotions/validate
const validatePromotion = async (req, res) => {
  try {
    const { code, orderAmount, serviceWindow, franchiseId } = req.body;
    if (!code) return error(res, 'Promotion code is required', 400);

    const promo = await Promotion.findOne({
      code: code.toUpperCase(),
      franchiseId: franchiseId || req.user.franchiseId,
      isActive: true,
      isDeleted: false,
      validFrom: { $lte: new Date() },
      validUntil: { $gte: new Date() },
    });

    if (!promo) return error(res, 'Invalid or expired promotion code', 400);
    if (promo.usageLimit > 0 && promo.usageCount >= promo.usageLimit) {
      return error(res, 'Promotion usage limit reached', 400);
    }
    if (orderAmount && orderAmount < promo.minOrderValue) {
      return error(res, `Minimum order value of ₹${promo.minOrderValue} required`, 400);
    }
    if (promo.applicableWindow.length > 0 && serviceWindow && !promo.applicableWindow.includes(serviceWindow)) {
      return error(res, 'Promotion not valid for this service window', 400);
    }

    const amount = orderAmount || 0;
    let discountAmount = 0;
    if (promo.discountType === 'percent') {
      discountAmount = (amount * promo.discountValue) / 100;
      if (promo.maxDiscount > 0) discountAmount = Math.min(discountAmount, promo.maxDiscount);
    } else {
      discountAmount = promo.discountValue;
    }

    return success(res, { valid: true, promotion: promo, discountAmount: Math.min(discountAmount, amount) }, 'Promotion is valid');
  } catch (err) {
    console.error('Validate promotion error:', err);
    return error(res, 'Failed to validate promotion', 500);
  }
};

// PATCH /promotions/:id/toggle
const togglePromotion = async (req, res) => {
  try {
    const promo = await Promotion.findOne({ _id: req.params.id, isDeleted: false });
    if (!promo) return notFound(res, 'Promotion not found');
    const updated = await Promotion.findByIdAndUpdate(req.params.id, { isActive: !promo.isActive }, { new: true });
    return success(res, updated, `Promotion ${updated.isActive ? 'activated' : 'deactivated'}`);
  } catch (err) {
    console.error('Toggle promotion error:', err);
    return error(res, 'Failed to toggle promotion', 500);
  }
};

module.exports = { getPromotions, getPromotionById, createPromotion, updatePromotion, deletePromotion, validatePromotion, togglePromotion };
