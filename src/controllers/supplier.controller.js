// src/controllers/supplier.controller.js
const Supplier = require('../models/Supplier');
const StockMovement = require('../models/StockMovement');
const { getPaginationParams, buildPaginationMeta } = require('../utils/pagination');
const { success, created, paginated, notFound, error } = require('../utils/apiResponse');

// ── Helpers ──────────────────────────────────────────────────────────────────

const buildFilter = (req) => {
  const filter = { isDeleted: false };
  // Non-admins only see their own franchise's suppliers
  if (req.user.role !== 'system_admin' && req.user.franchiseId) {
    filter.franchiseId = req.user.franchiseId;
  }
  return filter;
};

// ── GET /inventory/suppliers ─────────────────────────────────────────────────

const getSuppliers = async (req, res) => {
  try {
    const { page, limit, skip, sort } = getPaginationParams(req.query);
    const filter = buildFilter(req);

    if (req.query.franchiseId) filter.franchiseId = req.query.franchiseId;
    if (req.query.branchId)    filter.linkedBranchIds = req.query.branchId;
    if (req.query.active === 'true')  filter.isActive = true;
    if (req.query.active === 'false') filter.isActive = false;

    if (req.query.search) {
      const rx = new RegExp(req.query.search, 'i');
      filter.$or = [{ name: rx }, { contactName: rx }, { phone: rx }, { email: rx }];
    }

    const [items, total] = await Promise.all([
      Supplier.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      Supplier.countDocuments(filter),
    ]);

    return paginated(res, items, buildPaginationMeta(total, page, limit));
  } catch (err) {
    console.error('Get suppliers error:', err);
    return error(res, 'Failed to fetch suppliers');
  }
};

// ── GET /inventory/suppliers/:id ─────────────────────────────────────────────

const getSupplierById = async (req, res) => {
  try {
    const filter = { ...buildFilter(req), _id: req.params.id };
    const supplier = await Supplier.findOne(filter).lean();
    if (!supplier) return notFound(res, 'Supplier not found');
    return success(res, supplier);
  } catch (err) {
    console.error('Get supplier error:', err);
    return error(res, 'Failed to fetch supplier');
  }
};

// ── POST /inventory/suppliers ─────────────────────────────────────────────────

const createSupplier = async (req, res) => {
  try {
    const { name, contactName, phone, email, address, gstNo, franchiseId, isActive } = req.body;
    const supplier = await Supplier.create({
      name, contactName, phone, email, address, gstNo,
      franchiseId: franchiseId || req.user.franchiseId || null,
      isActive: isActive !== undefined ? isActive : true,
    });
    return created(res, supplier.toObject(), 'Supplier created');
  } catch (err) {
    console.error('Create supplier error:', err);
    return error(res, 'Failed to create supplier');
  }
};

// ── PUT /inventory/suppliers/:id ─────────────────────────────────────────────

const updateSupplier = async (req, res) => {
  try {
    const filter = { ...buildFilter(req), _id: req.params.id };
    const { name, contactName, phone, email, address, gstNo, isActive } = req.body;
    const supplier = await Supplier.findOneAndUpdate(
      filter,
      { $set: { name, contactName, phone, email, address, gstNo, isActive } },
      { new: true, runValidators: true }
    );
    if (!supplier) return notFound(res, 'Supplier not found');
    return success(res, supplier.toObject(), 'Supplier updated');
  } catch (err) {
    console.error('Update supplier error:', err);
    return error(res, 'Failed to update supplier');
  }
};

// ── DELETE /inventory/suppliers/:id ──────────────────────────────────────────

const deleteSupplier = async (req, res) => {
  try {
    const filter = { ...buildFilter(req), _id: req.params.id };
    const supplier = await Supplier.findOneAndUpdate(
      filter,
      { $set: { isDeleted: true, isActive: false } },
      { new: true }
    );
    if (!supplier) return notFound(res, 'Supplier not found');
    return success(res, null, 'Supplier deleted');
  } catch (err) {
    console.error('Delete supplier error:', err);
    return error(res, 'Failed to delete supplier');
  }
};

// ── POST /inventory/suppliers/:id/link-branch ─────────────────────────────────

const linkBranch = async (req, res) => {
  try {
    const { branchId } = req.body;
    const supplier = await Supplier.findByIdAndUpdate(
      req.params.id,
      { $addToSet: { linkedBranchIds: branchId } },
      { new: true }
    );
    if (!supplier) return notFound(res, 'Supplier not found');
    return success(res, supplier.toObject(), 'Branch linked');
  } catch (err) {
    console.error('Link branch error:', err);
    return error(res, 'Failed to link branch');
  }
};

// ── DELETE /inventory/suppliers/:id/branches/:branchId ───────────────────────

const unlinkBranch = async (req, res) => {
  try {
    const supplier = await Supplier.findByIdAndUpdate(
      req.params.id,
      { $pull: { linkedBranchIds: req.params.branchId } },
      { new: true }
    );
    if (!supplier) return notFound(res, 'Supplier not found');
    return success(res, supplier.toObject(), 'Branch unlinked');
  } catch (err) {
    console.error('Unlink branch error:', err);
    return error(res, 'Failed to unlink branch');
  }
};

// ── GET /inventory/movements/suppliers ───────────────────────────────────────
// Returns unique supplier names referenced in stock movements (for filter chips)

const getMovementSupplierNames = async (req, res) => {
  try {
    const match = {};
    if (req.query.branchId) match.branchId = req.query.branchId;
    if (req.query.itemId)   match.itemId   = req.query.itemId;

    const names = await StockMovement.distinct('supplier.name', match);
    const filtered = names.filter(Boolean).sort();
    return success(res, filtered);
  } catch (err) {
    console.error('Get movement supplier names error:', err);
    return error(res, 'Failed to fetch supplier names');
  }
};

module.exports = {
  getSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  linkBranch,
  unlinkBranch,
  getMovementSupplierNames,
};
