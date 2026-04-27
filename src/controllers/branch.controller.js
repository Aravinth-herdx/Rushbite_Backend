const Branch = require('../models/Branch');
const Franchise = require('../models/Franchise');
const { getPaginationParams, buildPaginationMeta } = require('../utils/pagination');
const { success, created, paginated, error, notFound } = require('../utils/apiResponse');

// Validate "HH:mm" IST time string
const isValidTime = (t) => {
  if (!t || typeof t !== 'string') return false;
  if (!/^\d{2}:\d{2}$/.test(t)) return false;
  const [h, m] = t.split(':').map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
};

const validateBranchPayload = (body) => {
  const errors = [];

  // Working hours
  if (body.workingHours) {
    const { openTime, closeTime } = body.workingHours;
    if (openTime  && !isValidTime(openTime))  errors.push('workingHours.openTime must be HH:mm');
    if (closeTime && !isValidTime(closeTime)) errors.push('workingHours.closeTime must be HH:mm');
    if (isValidTime(openTime) && isValidTime(closeTime) && openTime >= closeTime)
      errors.push('workingHours.openTime must be before closeTime');
  }

  // Service windows
  if (Array.isArray(body.serviceWindows)) {
    const names = [];
    body.serviceWindows.forEach((w, i) => {
      if (!w.name || !w.name.trim()) { errors.push(`serviceWindows[${i}]: name is required`); return; }
      const name = w.name.trim().toLowerCase();
      if (names.includes(name)) errors.push(`serviceWindows: duplicate name "${w.name}"`);
      else names.push(name);
      if (w.startTime && !isValidTime(w.startTime)) errors.push(`serviceWindows "${w.name}": invalid startTime (use HH:mm)`);
      if (w.endTime   && !isValidTime(w.endTime))   errors.push(`serviceWindows "${w.name}": invalid endTime (use HH:mm)`);
      if (isValidTime(w.startTime) && isValidTime(w.endTime) && w.startTime >= w.endTime)
        errors.push(`serviceWindows "${w.name}": startTime must be before endTime`);
    });
  }

  // Holidays
  if (Array.isArray(body.holidays)) {
    body.holidays.forEach((h, i) => {
      if (!h.date || !/^\d{4}-\d{2}-\d{2}$/.test(h.date))
        errors.push(`holidays[${i}]: date must be YYYY-MM-DD`);
    });
  }

  return errors;
};

// GET /branches
const getBranches = async (req, res) => {
  try {
    const { page, limit, skip, sort } = getPaginationParams(req.query);
    const { franchiseId, isActive, search } = req.query;

    const filter = { isDeleted: false };

    if (req.user.role !== 'system_admin' && req.user.franchiseId) {
      filter.franchiseId = req.user.franchiseId;
    }
    if (franchiseId) filter.franchiseId = franchiseId;
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
        { city: { $regex: search, $options: 'i' } },
      ];
    }

    const [branches, total] = await Promise.all([
      Branch.find(filter).populate('franchiseId', 'name code').sort(sort).skip(skip).limit(limit),
      Branch.countDocuments(filter),
    ]);

    return paginated(res, branches, buildPaginationMeta(total, page, limit));
  } catch (err) {
    console.error('Get branches error:', err);
    return error(res, 'Failed to fetch branches', 500);
  }
};

// GET /branches/:id
const getBranchById = async (req, res) => {
  try {
    const branch = await Branch.findOne({ _id: req.params.id, isDeleted: false })
      .populate('franchiseId', 'name code');
    if (!branch) return notFound(res, 'Branch not found');
    return success(res, branch);
  } catch (err) {
    console.error('Get branch error:', err);
    return error(res, 'Failed to fetch branch', 500);
  }
};

// POST /branches
const createBranch = async (req, res) => {
  try {
    const {
      franchiseId, name, code, address, city, state, phone, email, managerName,
      serviceWindows, workingDays, workingHours, holidays,
    } = req.body;

    if (!franchiseId || !name || !code)
      return error(res, 'franchiseId, name, and code are required', 400);

    const validationErrors = validateBranchPayload(req.body);
    if (validationErrors.length) return error(res, validationErrors.join('; '), 400);

    const franchise = await Franchise.findOne({ _id: franchiseId, isDeleted: false });
    if (!franchise) return error(res, 'Franchise not found', 404);

    const branch = await Branch.create({
      franchiseId, name, code, address, city, state, phone, email, managerName,
      serviceWindows: serviceWindows || [],
      workingDays:   workingDays   || undefined,
      workingHours:  workingHours  || undefined,
      holidays:      holidays      || [],
    });

    await Franchise.findByIdAndUpdate(franchiseId, {
      $inc: { 'stats.totalBranches': 1, 'stats.activeBranches': 1 },
    });

    const saved = await Branch.findById(branch._id).populate('franchiseId', 'name code');
    return created(res, saved, 'Branch created successfully');
  } catch (err) {
    console.error('Create branch error:', err);
    return error(res, 'Failed to create branch', 500);
  }
};

// PUT /branches/:id
const updateBranch = async (req, res) => {
  try {
    const branch = await Branch.findOne({ _id: req.params.id, isDeleted: false });
    if (!branch) return notFound(res, 'Branch not found');

    const validationErrors = validateBranchPayload(req.body);
    if (validationErrors.length) return error(res, validationErrors.join('; '), 400);

    const allowedFields = [
      'name', 'code', 'address', 'city', 'state', 'phone', 'email', 'managerName',
      'serviceWindows', 'isActive', 'notes',
      'workingDays', 'workingHours', 'holidays',
    ];
    const updates = {};
    allowedFields.forEach((f) => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

    const updated = await Branch.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true })
      .populate('franchiseId', 'name code');

    return success(res, updated, 'Branch updated successfully');
  } catch (err) {
    console.error('Update branch error:', err);
    return error(res, 'Failed to update branch', 500);
  }
};

// DELETE /branches/:id
const deleteBranch = async (req, res) => {
  try {
    const branch = await Branch.findOne({ _id: req.params.id, isDeleted: false });
    if (!branch) return notFound(res, 'Branch not found');

    await Branch.findByIdAndUpdate(req.params.id, { isDeleted: true, isActive: false });
    await Franchise.findByIdAndUpdate(branch.franchiseId, {
      $inc: { 'stats.totalBranches': -1, 'stats.activeBranches': -1 },
    });

    return success(res, null, 'Branch deleted successfully');
  } catch (err) {
    console.error('Delete branch error:', err);
    return error(res, 'Failed to delete branch', 500);
  }
};

module.exports = { getBranches, getBranchById, createBranch, updateBranch, deleteBranch };
