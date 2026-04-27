const User = require('../models/User');
const Branch = require('../models/Branch');
const Franchise = require('../models/Franchise');
const AuditLog = require('../models/AuditLog');
const { getPaginationParams, buildPaginationMeta } = require('../utils/pagination');
const { success, created, paginated, error, notFound } = require('../utils/apiResponse');
const { generateEmployeeId } = require('../utils/tokenGenerator');
const { sendWelcomeEmail, sendStaffAddedNotification } = require('../utils/email');

// GET /users
const getUsers = async (req, res) => {
  try {
    const { page, limit, skip, sort } = getPaginationParams(req.query);
    const { role, franchiseId, branchId, isActive, search } = req.query;

    const filter = { isDeleted: false };

    // Non-admin users see only their franchise
    if (req.user.role !== 'system_admin' && req.user.franchiseId) {
      filter.franchiseId = req.user.franchiseId;
    }

    if (role) filter.role = role;
    if (franchiseId) filter.franchiseId = franchiseId;
    // Match users whose primary branchId OR any branchRoles entry matches
    if (branchId) {
      filter.$or = [
        { branchId: branchId },
        { 'branchRoles.branchId': branchId },
      ];
    }
    if (isActive !== undefined) filter.isActive = isActive === 'true';

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { employeeId: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .select('-password -refreshTokenHash -otp -otpExpiry')
        .populate('franchiseId', 'name code')
        .populate('branchId', 'name code')
        .populate('branchRoles.branchId', 'name code')
        .populate('branchRoles.franchiseId', 'name code')
        .sort(sort)
        .skip(skip)
        .limit(limit),
      User.countDocuments(filter),
    ]);

    return paginated(res, users, buildPaginationMeta(total, page, limit));
  } catch (err) {
    console.error('Get users error:', err);
    return error(res, 'Failed to fetch users', 500);
  }
};

// GET /users/:id
const getUserById = async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.params.id, isDeleted: false })
      .select('-password -refreshTokenHash -otp -otpExpiry')
      .populate('franchiseId', 'name code')
      .populate('branchId', 'name code')
      .populate('branchRoles.branchId', 'name code')
      .populate('branchRoles.franchiseId', 'name code');

    if (!user) return notFound(res, 'User not found');
    return success(res, user);
  } catch (err) {
    console.error('Get user error:', err);
    return error(res, 'Failed to fetch user', 500);
  }
};

// Helper: parse branchRoles whether it arrived as an array (JSON body) or
// a JSON string (multipart form-data field)
const _parseBranchRoles = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return []; }
  }
  return [];
};

// POST /users
const createUser = async (req, res) => {
  try {
    const { name, email, phone, role, password, department, franchiseId, branchId, permissions, employeeTag } = req.body;
    const branchRoles = _parseBranchRoles(req.body.branchRoles);

    // Derive primary role/branch from first branchRole if not explicitly supplied
    const primaryRole = role || (branchRoles && branchRoles.length ? branchRoles[0].role : null);
    const primaryFranchiseId = franchiseId || (branchRoles && branchRoles.length ? branchRoles[0].franchiseId : null);
    const primaryBranchId = branchId || (branchRoles && branchRoles.length ? branchRoles[0].branchId : null);

    if (!name || !email || !primaryRole || !password) {
      return error(res, 'Name, email, role, and password are required', 400);
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return error(res, 'Email already exists', 400);

    const employeeId = await generateEmployeeId(User);

    const user = await User.create({
      name,
      email,
      phone,
      role: primaryRole,
      password,
      department,
      employeeId,
      employeeTag: employeeTag || 'employee',
      franchiseId: primaryFranchiseId || null,
      branchId: primaryBranchId || null,
      branchRoles: branchRoles || [],
      permissions: permissions || {},
      avatar: req.fileUrl || '',
      createdBy: req.user._id,
    });

    const savedUser = await User.findById(user._id)
      .select('-password -refreshTokenHash')
      .populate('franchiseId', 'name code email ownerName')
      .populate('branchId', 'name code email managerName');

    // ── Send emails asynchronously (don't block the response) ──────────────
    _sendCreationEmails(savedUser, password, req.user.name).catch((err) => {
      console.error('[EMAIL] Failed to send creation emails:', err.message);
    });

    return created(res, savedUser, 'User created successfully');
  } catch (err) {
    console.error('Create user error:', err);
    return error(res, 'Failed to create user', 500);
  }
};

/**
 * Fire-and-forget email sender after staff creation.
 * Sends:
 *   1. Welcome email → new employee
 *   2. Notification → branch email (if set)
 *   3. Notification → franchise email (if set, and different from branch)
 */
const _sendCreationEmails = async (user, plainPassword, addedByName) => {
  const franchiseName = user.franchiseId?.name || '';
  const branchName = user.branchId?.name || '';

  // 1. Welcome email to the new employee
  await sendWelcomeEmail({
    name: user.name,
    email: user.email,
    password: plainPassword,
    role: user.role,
    branchName,
    franchiseName,
    employeeId: user.employeeId,
  }).catch((e) => console.error('[EMAIL] Welcome email failed:', e.message));

  // 2. Notify branch email
  const branchEmail = user.branchId?.email;
  if (branchEmail) {
    await sendStaffAddedNotification({
      recipientEmail: branchEmail,
      recipientName: user.branchId?.managerName || branchName,
      staffName: user.name,
      staffEmail: user.email,
      staffRole: user.role,
      branchName,
      franchiseName,
      employeeId: user.employeeId,
      addedBy: addedByName,
    }).catch((e) => console.error('[EMAIL] Branch notification failed:', e.message));
  }

  // 3. Notify franchise email (only if different from branch email)
  const franchiseEmail = user.franchiseId?.email;
  if (franchiseEmail && franchiseEmail !== branchEmail) {
    await sendStaffAddedNotification({
      recipientEmail: franchiseEmail,
      recipientName: user.franchiseId?.ownerName || franchiseName,
      staffName: user.name,
      staffEmail: user.email,
      staffRole: user.role,
      branchName,
      franchiseName,
      employeeId: user.employeeId,
      addedBy: addedByName,
    }).catch((e) => console.error('[EMAIL] Franchise notification failed:', e.message));
  }
};

// PUT /users/:id
const updateUser = async (req, res) => {
  try {
    const existing = await User.findOne({ _id: req.params.id, isDeleted: false });
    if (!existing) return notFound(res, 'User not found');

    const { name, phone, role, department, franchiseId, branchId, permissions, isActive, employeeTag } = req.body;
    const branchRoles = req.body.branchRoles !== undefined
      ? _parseBranchRoles(req.body.branchRoles)
      : undefined;

    const before = existing.toObject();

    // Derive primary fields from branchRoles if provided
    const primaryRole = role || (branchRoles && branchRoles.length ? branchRoles[0].role : undefined);
    const primaryFranchiseId = franchiseId !== undefined ? franchiseId : (branchRoles && branchRoles.length ? branchRoles[0].franchiseId : undefined);
    const primaryBranchId = branchId !== undefined ? branchId : (branchRoles && branchRoles.length ? branchRoles[0].branchId : undefined);

    const updates = { updatedBy: req.user._id };
    if (name) updates.name = name;
    if (phone !== undefined) updates.phone = phone;
    if (primaryRole) updates.role = primaryRole;
    if (department !== undefined) updates.department = department;
    if (employeeTag !== undefined) updates.employeeTag = employeeTag;
    if (primaryFranchiseId !== undefined) updates.franchiseId = primaryFranchiseId || null;
    if (primaryBranchId !== undefined) updates.branchId = primaryBranchId || null;
    if (branchRoles !== undefined) updates.branchRoles = branchRoles;
    if (permissions) updates.permissions = { ...existing.permissions.toObject(), ...permissions };
    if (isActive !== undefined) updates.isActive = isActive;
    if (req.fileUrl) updates.avatar = req.fileUrl;

    const updated = await User.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true })
      .select('-password -refreshTokenHash')
      .populate('franchiseId', 'name code')
      .populate('branchId', 'name code')
      .populate('branchRoles.branchId', 'name code')
      .populate('branchRoles.franchiseId', 'name code');

    await AuditLog.create({
      action: 'UPDATE',
      resource: 'user',
      resourceId: updated._id,
      resourceName: updated.name,
      userId: req.user._id,
      userName: req.user.name,
      userRole: req.user.role,
      franchiseId: req.user.franchiseId || null,
      changes: { before, after: updated.toObject() },
      ip: req.ip || '',
    });

    return success(res, updated, 'User updated successfully');
  } catch (err) {
    console.error('Update user error:', err);
    return error(res, 'Failed to update user', 500);
  }
};

// DELETE /users/:id
const deleteUser = async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.params.id, isDeleted: false });
    if (!user) return notFound(res, 'User not found');

    await User.findByIdAndUpdate(req.params.id, { isDeleted: true, isActive: false, updatedBy: req.user._id });

    await AuditLog.create({
      action: 'DELETE',
      resource: 'user',
      resourceId: user._id,
      resourceName: user.name,
      userId: req.user._id,
      userName: req.user.name,
      userRole: req.user.role,
      franchiseId: req.user.franchiseId || null,
      ip: req.ip || '',
    });

    return success(res, null, 'User deleted successfully');
  } catch (err) {
    console.error('Delete user error:', err);
    return error(res, 'Failed to delete user', 500);
  }
};

// PATCH /users/:id/status
const toggleUserStatus = async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.params.id, isDeleted: false });
    if (!user) return notFound(res, 'User not found');

    const updated = await User.findByIdAndUpdate(
      req.params.id,
      { isActive: !user.isActive, updatedBy: req.user._id },
      { new: true }
    ).select('-password -refreshTokenHash');

    return success(res, updated, `User ${updated.isActive ? 'activated' : 'deactivated'} successfully`);
  } catch (err) {
    console.error('Toggle user status error:', err);
    return error(res, 'Failed to toggle user status', 500);
  }
};

// GET /users/stats
const getUserStats = async (req, res) => {
  try {
    const filter = { isDeleted: false };
    if (req.user.role !== 'system_admin' && req.user.franchiseId) {
      filter.franchiseId = req.user.franchiseId;
    }

    const stats = await User.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: { $sum: { $cond: ['$isActive', 1, 0] } },
          inactive: { $sum: { $cond: ['$isActive', 0, 1] } },
        },
      },
    ]);

    const roleStats = await User.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 },
          active: { $sum: { $cond: ['$isActive', 1, 0] } },
        },
      },
    ]);

    return success(res, {
      total: stats[0]?.total || 0,
      active: stats[0]?.active || 0,
      inactive: stats[0]?.inactive || 0,
      byRole: roleStats,
    });
  } catch (err) {
    console.error('User stats error:', err);
    return error(res, 'Failed to fetch user stats', 500);
  }
};

// POST /users/bulk — create multiple staff with same role/branch
const createBulkUsers = async (req, res) => {
  try {
    const { members, role, franchiseId, branchId, employeeTag, defaultPassword } = req.body;
    const branchRoles = _parseBranchRoles(req.body.branchRoles);

    if (!Array.isArray(members) || members.length === 0) {
      return error(res, 'members array is required', 400);
    }

    const primaryRole = role || (branchRoles && branchRoles.length ? branchRoles[0].role : null);
    const primaryFranchiseId = franchiseId || (branchRoles && branchRoles.length ? branchRoles[0].franchiseId : null);
    const primaryBranchId = branchId || (branchRoles && branchRoles.length ? branchRoles[0].branchId : null);

    if (!primaryRole) {
      return error(res, 'role is required', 400);
    }

    const results = [];
    const errors = [];

    for (const member of members) {
      const { name, email, phone } = member;
      if (!name || !email) {
        errors.push({ email: email || '?', reason: 'name and email required' });
        continue;
      }
      const existingUser = await User.findOne({ email: email.toLowerCase() });
      if (existingUser) {
        errors.push({ email, reason: 'email already exists' });
        continue;
      }
      const password = member.password || defaultPassword || 'Cafeteria@123';
      const employeeId = await generateEmployeeId(User);

      const user = await User.create({
        name,
        email,
        phone: phone || '',
        role: primaryRole,
        password,
        employeeId,
        employeeTag: employeeTag || 'employee',
        franchiseId: primaryFranchiseId || null,
        branchId: primaryBranchId || null,
        branchRoles: branchRoles || [],
        permissions: {},
        avatar: '',
        createdBy: req.user._id,
      });

      const savedUser = await User.findById(user._id)
        .select('-password -refreshTokenHash')
        .populate('franchiseId', 'name code email ownerName')
        .populate('branchId', 'name code email managerName');

      _sendCreationEmails(savedUser, password, req.user.name).catch((err) => {
        console.error('[EMAIL] Bulk creation email failed:', err.message);
      });

      results.push(savedUser);
    }

    return success(res, { created: results, errors }, `${results.length} staff member(s) created`);
  } catch (err) {
    console.error('Bulk create users error:', err);
    return error(res, 'Failed to create users', 500);
  }
};

// POST /users/:id/send-credentials
const sendCredentials = async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.params.id, isDeleted: false });
    if (!user) return notFound(res, 'User not found');

    // Generate a temporary password and save it (model pre-save hook will hash it)
    const tempPassword = `Cafe${Math.random().toString(36).slice(-6).toUpperCase()}@1`;
    user.password = tempPassword;
    await user.save();

    // Send welcome-style email with new temporary password
    try {
      const branchName = user.branchId?.name || '';
      const franchiseName = user.franchiseId?.name || '';
      await sendWelcomeEmail({
        name: user.name,
        email: user.email,
        password: tempPassword,
        role: user.role,
        branchName,
        franchiseName,
        employeeId: user.employeeId,
      });
    } catch (emailErr) {
      console.log(`[SEND CREDENTIALS] New password for ${user.email}: ${tempPassword}`);
    }

    return success(res, null, 'Credentials sent to ' + user.email);
  } catch (err) {
    console.error('Send credentials error:', err);
    return error(res, 'Failed to send credentials', 500);
  }
};

module.exports = { getUsers, getUserById, createUser, updateUser, deleteUser, toggleUserStatus, getUserStats, createBulkUsers, sendCredentials };
