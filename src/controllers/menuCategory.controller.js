const MenuCategory = require('../models/MenuCategory');
const { success, created, error, notFound } = require('../utils/apiResponse');

// GET /menu/categories
const getCategories = async (req, res) => {
  try {
    const franchiseId = req.query.franchiseId || req.user.franchiseId;
    const { branchId } = req.query;

    const filter = { isDeleted: false, isActive: true };
    if (franchiseId) filter.franchiseId = franchiseId;

    // Return branch-specific + franchise-wide (branchId: null) categories
    if (branchId) {
      filter.$or = [{ branchId }, { branchId: null }];
    }

    const categories = await MenuCategory.find(filter).sort({ displayOrder: 1, name: 1 });
    return success(res, categories);
  } catch (err) {
    console.error('Get categories error:', err);
    return error(res, 'Failed to fetch categories', 500);
  }
};

// POST /menu/categories
const createCategory = async (req, res) => {
  try {
    const franchiseId = req.body.franchiseId || req.user.franchiseId;
    const { name, branchId, displayOrder } = req.body;

    if (!franchiseId || !name) {
      return error(res, 'franchiseId and name are required', 400);
    }

    const existing = await MenuCategory.findOne({
      name: { $regex: new RegExp(`^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      franchiseId,
      branchId: branchId || null,
      isDeleted: false,
    });
    if (existing) return error(res, `Category "${name}" already exists`, 409);

    const cat = await MenuCategory.create({
      name: name.trim(),
      franchiseId,
      branchId: branchId || null,
      displayOrder: Number(displayOrder) || 0,
      createdBy: req.user._id,
    });

    return created(res, cat, 'Category created');
  } catch (err) {
    console.error('Create category error:', err);
    return error(res, 'Failed to create category', 500);
  }
};

// PUT /menu/categories/:id
const updateCategory = async (req, res) => {
  try {
    const cat = await MenuCategory.findOne({ _id: req.params.id, isDeleted: false });
    if (!cat) return notFound(res, 'Category not found');

    const updates = {};
    if (req.body.name !== undefined) updates.name = req.body.name.trim();
    if (req.body.displayOrder !== undefined) updates.displayOrder = Number(req.body.displayOrder);
    if (req.body.isActive !== undefined) updates.isActive = Boolean(req.body.isActive);

    const updated = await MenuCategory.findByIdAndUpdate(req.params.id, updates, { new: true });
    return success(res, updated, 'Category updated');
  } catch (err) {
    console.error('Update category error:', err);
    return error(res, 'Failed to update category', 500);
  }
};

// DELETE /menu/categories/:id
const deleteCategory = async (req, res) => {
  try {
    const cat = await MenuCategory.findOne({ _id: req.params.id, isDeleted: false });
    if (!cat) return notFound(res, 'Category not found');

    await MenuCategory.findByIdAndUpdate(req.params.id, { isDeleted: true });
    return success(res, null, 'Category deleted');
  } catch (err) {
    console.error('Delete category error:', err);
    return error(res, 'Failed to delete category', 500);
  }
};

module.exports = { getCategories, createCategory, updateCategory, deleteCategory };
