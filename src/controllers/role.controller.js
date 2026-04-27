const Role = require('../models/Role');
const User = require('../models/User');
const { getPaginationParams, buildPaginationMeta } = require('../utils/pagination');
const { success, created, paginated, error, notFound, forbidden } = require('../utils/apiResponse');

// GET /roles
// system_admin: sees all (optionally filter by franchiseId query param)
// cafeteria_manager + others: sees global roles (franchiseId: null) + their franchise's roles
const getRoles = async (req, res) => {
  try {
    const { page, limit, skip, sort } = getPaginationParams(req.query);
    let filter = { isDeleted: false };

    if (req.user.role === 'system_admin') {
      // Allow optional franchiseId filter for admin
      if (req.query.franchiseId) {
        filter.$or = [
          { franchiseId: null },
          { franchiseId: req.query.franchiseId },
        ];
      }
    } else {
      // Non-admin: show global roles + their franchise-specific roles
      const userFranchiseId = req.user.franchiseId || null;
      if (userFranchiseId) {
        filter.$or = [
          { franchiseId: null },
          { franchiseId: userFranchiseId },
        ];
      } else {
        filter.franchiseId = null;
      }
    }

    const [roles, total] = await Promise.all([
      Role.find(filter)
        .populate('franchiseId', 'name code')
        .sort(sort)
        .skip(skip)
        .limit(limit),
      Role.countDocuments(filter),
    ]);

    const rolesWithCounts = await Promise.all(
      roles.map(async (role) => {
        const count = await User.countDocuments({ role: role.name, isDeleted: false });
        return { ...role.toObject(), userCount: count };
      })
    );

    return paginated(res, rolesWithCounts, buildPaginationMeta(total, page, limit));
  } catch (err) {
    console.error('Get roles error:', err);
    return error(res, 'Failed to fetch roles', 500);
  }
};

// GET /roles/:id
const getRoleById = async (req, res) => {
  try {
    const role = await Role.findOne({ _id: req.params.id, isDeleted: false })
      .populate('franchiseId', 'name code');
    if (!role) return notFound(res, 'Role not found');

    // Non-admin can only view global roles or their own franchise's roles
    if (req.user.role !== 'system_admin') {
      const userFranchiseId = req.user.franchiseId?.toString();
      const roleFranchiseId = role.franchiseId?._id?.toString() ?? role.franchiseId?.toString();
      if (roleFranchiseId && roleFranchiseId !== userFranchiseId) {
        return forbidden(res, 'Access denied');
      }
    }

    const userCount = await User.countDocuments({ role: role.name, isDeleted: false });
    return success(res, { ...role.toObject(), userCount });
  } catch (err) {
    console.error('Get role error:', err);
    return error(res, 'Failed to fetch role', 500);
  }
};

// POST /roles
// system_admin: can create global (franchiseId: null) or franchise-specific roles
// cafeteria_manager with manageRoles: can only create roles scoped to their own franchise
const createRole = async (req, res) => {
  try {
    const { name, displayName, description, permissions } = req.body;
    if (!name || !displayName) return error(res, 'Name and displayName are required', 400);

    let franchiseId = null;

    if (req.user.role === 'system_admin') {
      franchiseId = req.body.franchiseId || null;
    } else {
      // Franchise manager: must have manageRoles permission, scoped to their franchise
      if (!req.user.permissions?.manageRoles) {
        return forbidden(res, 'Permission manageRoles is required');
      }
      if (!req.user.franchiseId) {
        return error(res, 'No franchise associated with your account', 400);
      }
      franchiseId = req.user.franchiseId;
    }

    const existing = await Role.findOne({ name: name.toLowerCase(), franchiseId });
    if (existing) return error(res, 'Role name already exists for this scope', 400);

    const role = await Role.create({
      name: name.toLowerCase(),
      displayName,
      description,
      permissions: permissions || {},
      franchiseId,
    });

    await role.populate('franchiseId', 'name code');
    return created(res, role, 'Role created successfully');
  } catch (err) {
    console.error('Create role error:', err);
    return error(res, 'Failed to create role', 500);
  }
};

// PUT /roles/:id
const updateRole = async (req, res) => {
  try {
    const role = await Role.findOne({ _id: req.params.id, isDeleted: false });
    if (!role) return notFound(res, 'Role not found');

    // Franchise managers can only update their own franchise's roles
    if (req.user.role !== 'system_admin') {
      if (!req.user.permissions?.manageRoles) {
        return forbidden(res, 'Permission manageRoles is required');
      }
      const userFranchiseId = req.user.franchiseId?.toString();
      const roleFranchiseId = role.franchiseId?.toString();
      if (!roleFranchiseId || roleFranchiseId !== userFranchiseId) {
        return forbidden(res, 'You can only update roles belonging to your franchise');
      }
    }

    const { displayName, description, permissions } = req.body;
    const updates = {};
    if (displayName) updates.displayName = displayName;
    if (description !== undefined) updates.description = description;
    if (permissions) updates.permissions = { ...role.permissions.toObject(), ...permissions };

    const updated = await Role.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true })
      .populate('franchiseId', 'name code');
    return success(res, updated, 'Role updated successfully');
  } catch (err) {
    console.error('Update role error:', err);
    return error(res, 'Failed to update role', 500);
  }
};

// DELETE /roles/:id
const deleteRole = async (req, res) => {
  try {
    const role = await Role.findOne({ _id: req.params.id, isDeleted: false });
    if (!role) return notFound(res, 'Role not found');
    if (role.isSystem) return error(res, 'System roles cannot be deleted', 400);

    // Franchise managers can only delete their own franchise's roles
    if (req.user.role !== 'system_admin') {
      if (!req.user.permissions?.manageRoles) {
        return forbidden(res, 'Permission manageRoles is required');
      }
      const userFranchiseId = req.user.franchiseId?.toString();
      const roleFranchiseId = role.franchiseId?.toString();
      if (!roleFranchiseId || roleFranchiseId !== userFranchiseId) {
        return forbidden(res, 'You can only delete roles belonging to your franchise');
      }
    }

    const userCount = await User.countDocuments({ role: role.name, isDeleted: false });
    if (userCount > 0) return error(res, `Cannot delete role. ${userCount} user(s) are assigned to it.`, 400);

    await Role.findByIdAndUpdate(req.params.id, { isDeleted: true });
    return success(res, null, 'Role deleted successfully');
  } catch (err) {
    console.error('Delete role error:', err);
    return error(res, 'Failed to delete role', 500);
  }
};

// GET /roles/franchise/:franchiseId  — shorthand for admin to list a franchise's roles
const getFranchiseRoles = async (req, res) => {
  try {
    const { page, limit, skip, sort } = getPaginationParams(req.query);
    const { franchiseId } = req.params;

    // Non-admin can only view their own franchise
    if (req.user.role !== 'system_admin') {
      if (req.user.franchiseId?.toString() !== franchiseId) {
        return forbidden(res, 'Access denied');
      }
    }

    const filter = { isDeleted: false, franchiseId };
    const [roles, total] = await Promise.all([
      Role.find(filter).populate('franchiseId', 'name code').sort(sort).skip(skip).limit(limit),
      Role.countDocuments(filter),
    ]);

    const rolesWithCounts = await Promise.all(
      roles.map(async (role) => {
        const count = await User.countDocuments({ role: role.name, isDeleted: false });
        return { ...role.toObject(), userCount: count };
      })
    );

    return paginated(res, rolesWithCounts, buildPaginationMeta(total, page, limit));
  } catch (err) {
    console.error('Get franchise roles error:', err);
    return error(res, 'Failed to fetch franchise roles', 500);
  }
};

module.exports = { getRoles, getRoleById, createRole, updateRole, deleteRole, getFranchiseRoles };
