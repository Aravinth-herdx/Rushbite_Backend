const Franchise = require('../models/Franchise');
const Branch = require('../models/Branch');
const AuditLog = require('../models/AuditLog');
const { getPaginationParams, buildPaginationMeta } = require('../utils/pagination');
const { success, created, paginated, error, notFound } = require('../utils/apiResponse');

// GET /franchises
const getFranchises = async (req, res) => {
  try {
    const { page, limit, skip, sort } = getPaginationParams(req.query);
    const { isActive, search } = req.query;

    const filter = { isDeleted: false };
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
        { ownerName: { $regex: search, $options: 'i' } },
      ];
    }

    const [franchises, total] = await Promise.all([
      Franchise.find(filter).sort(sort).skip(skip).limit(limit),
      Franchise.countDocuments(filter),
    ]);

    return paginated(res, franchises, buildPaginationMeta(total, page, limit));
  } catch (err) {
    console.error('Get franchises error:', err);
    return error(res, 'Failed to fetch franchises', 500);
  }
};

// GET /franchises/:id
const getFranchiseById = async (req, res) => {
  try {
    const franchise = await Franchise.findOne({ _id: req.params.id, isDeleted: false });
    if (!franchise) return notFound(res, 'Franchise not found');

    const branches = await Branch.find({ franchiseId: req.params.id, isDeleted: false });
    return success(res, { ...franchise.toObject(), branches });
  } catch (err) {
    console.error('Get franchise error:', err);
    return error(res, 'Failed to fetch franchise', 500);
  }
};

// POST /franchises
const createFranchise = async (req, res) => {
  try {
    const { name, code, ownerName, email, phone, address, city, state, pincode, gstin } = req.body;
    if (!name || !code || !ownerName) return error(res, 'Name, code, and ownerName are required', 400);

    const franchise = await Franchise.create({
      name, code, ownerName, email, phone, address, city, state, pincode, gstin,
      logo: req.fileUrl || '',
    });

    await AuditLog.create({
      action: 'CREATE', resource: 'franchise', resourceId: franchise._id,
      resourceName: franchise.name, userId: req.user._id, userName: req.user.name,
      userRole: req.user.role, ip: req.ip || '',
    });

    return created(res, franchise, 'Franchise created successfully');
  } catch (err) {
    console.error('Create franchise error:', err);
    return error(res, 'Failed to create franchise', 500);
  }
};

// PUT /franchises/:id
const updateFranchise = async (req, res) => {
  try {
    const franchise = await Franchise.findOne({ _id: req.params.id, isDeleted: false });
    if (!franchise) return notFound(res, 'Franchise not found');

    const allowedFields = ['name', 'ownerName', 'email', 'phone', 'address', 'city', 'state', 'pincode', 'gstin', 'isActive'];
    const updates = {};
    allowedFields.forEach((f) => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    if (req.fileUrl) updates.logo = req.fileUrl;

    const updated = await Franchise.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    return success(res, updated, 'Franchise updated successfully');
  } catch (err) {
    console.error('Update franchise error:', err);
    return error(res, 'Failed to update franchise', 500);
  }
};

// DELETE /franchises/:id
const deleteFranchise = async (req, res) => {
  try {
    const franchise = await Franchise.findOne({ _id: req.params.id, isDeleted: false });
    if (!franchise) return notFound(res, 'Franchise not found');

    await Franchise.findByIdAndUpdate(req.params.id, { isDeleted: true, isActive: false });
    return success(res, null, 'Franchise deleted successfully');
  } catch (err) {
    console.error('Delete franchise error:', err);
    return error(res, 'Failed to delete franchise', 500);
  }
};

// GET /franchises/:id/stats
const getFranchiseStats = async (req, res) => {
  try {
    const franchise = await Franchise.findOne({ _id: req.params.id, isDeleted: false });
    if (!franchise) return notFound(res, 'Franchise not found');

    const branches = await Branch.countDocuments({ franchiseId: req.params.id, isDeleted: false });
    const activeBranches = await Branch.countDocuments({ franchiseId: req.params.id, isDeleted: false, isActive: true });

    return success(res, { franchise, stats: { totalBranches: branches, activeBranches } });
  } catch (err) {
    console.error('Franchise stats error:', err);
    return error(res, 'Failed to fetch franchise stats', 500);
  }
};

module.exports = { getFranchises, getFranchiseById, createFranchise, updateFranchise, deleteFranchise, getFranchiseStats };
