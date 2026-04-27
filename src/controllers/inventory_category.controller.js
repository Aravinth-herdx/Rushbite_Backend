const InventoryCategory = require('../models/InventoryCategory');
const { success, created, error, notFound } = require('../utils/apiResponse');

const buildFilter = (req) => {
  const filter = { isDeleted: false };
  if (req.user.role !== 'system_admin' && req.user.franchiseId) {
    filter.$or = [
      { franchiseId: req.user.franchiseId },
      { franchiseId: null },
    ];
  }
  return filter;
};

// GET /inventory/categories
const getCategories = async (req, res) => {
  try {
    const filter = buildFilter(req);
    if (req.query.franchiseId) filter.franchiseId = req.query.franchiseId;
    if (req.query.active === 'true') filter.isActive = true;

    const categories = await InventoryCategory.find(filter).sort({ name: 1 });
    return success(res, categories);
  } catch (err) {
    console.error('Get categories error:', err);
    return error(res, 'Failed to fetch categories', 500);
  }
};

// POST /inventory/categories
const createCategory = async (req, res) => {
  try {
    const { name, description, color, icon, franchiseId, branchId } = req.body;
    if (!name) return error(res, 'Name is required', 400);

    const category = await InventoryCategory.create({
      name: name.trim(),
      description: description || '',
      color: color || '#6B7280',
      icon: icon || 'category',
      image: req.fileUrl || '',
      franchiseId: franchiseId || req.user.franchiseId || null,
      branchId: branchId || req.user.branchId || null,
    });
    return created(res, category, 'Category created');
  } catch (err) {
    console.error('Create category error:', err);
    return error(res, 'Failed to create category', 500);
  }
};

// PUT /inventory/categories/:id
const updateCategory = async (req, res) => {
  try {
    const cat = await InventoryCategory.findOne({ _id: req.params.id, isDeleted: false });
    if (!cat) return notFound(res, 'Category not found');

    const allowed = ['name', 'description', 'color', 'icon', 'isActive'];
    const updates = {};
    allowed.forEach((f) => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    if (req.fileUrl) updates.image = req.fileUrl;

    const updated = await InventoryCategory.findByIdAndUpdate(req.params.id, updates, { new: true });
    return success(res, updated, 'Category updated');
  } catch (err) {
    console.error('Update category error:', err);
    return error(res, 'Failed to update category', 500);
  }
};

// DELETE /inventory/categories/:id
const deleteCategory = async (req, res) => {
  try {
    const cat = await InventoryCategory.findOne({ _id: req.params.id, isDeleted: false });
    if (!cat) return notFound(res, 'Category not found');
    await InventoryCategory.findByIdAndUpdate(req.params.id, { isDeleted: true });
    return success(res, null, 'Category deleted');
  } catch (err) {
    console.error('Delete category error:', err);
    return error(res, 'Failed to delete category', 500);
  }
};

module.exports = { getCategories, createCategory, updateCategory, deleteCategory };
