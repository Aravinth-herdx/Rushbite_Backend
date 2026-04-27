const Notification = require('../models/Notification');
const { getPaginationParams, buildPaginationMeta } = require('../utils/pagination');
const { success, created, paginated, error, notFound } = require('../utils/apiResponse');

// GET /notifications
const getNotifications = async (req, res) => {
  try {
    const { page, limit, skip, sort } = getPaginationParams(req.query);
    const { isRead, branchId, franchiseId } = req.query;

    const filter = { isDeleted: false };

    // Filter notifications targeted at this user's role or directly at this user
    if (req.user.role !== 'system_admin') {
      filter.$or = [
        { targetRole: req.user.role },
        { targetUsers: req.user._id },
        { targetRole: { $size: 0 }, targetUsers: { $size: 0 } },
      ];
    }

    if (req.user.franchiseId) {
      filter.$and = filter.$and || [];
      filter.$and.push({ $or: [{ franchiseId: req.user.franchiseId }, { franchiseId: null }] });
    }

    // System admin explicit filters
    if (franchiseId && req.user.role === 'system_admin') {
      filter.$and = filter.$and || [];
      filter.$and.push({ $or: [{ franchiseId }, { franchiseId: null }] });
    }
    if (branchId) {
      filter.$and = filter.$and || [];
      filter.$and.push({ $or: [{ branchId }, { branchId: null }] });
    }

    if (isRead !== undefined) filter.isRead = isRead === 'true';

    const [notifications, total] = await Promise.all([
      Notification.find(filter).sort(sort).skip(skip).limit(limit),
      Notification.countDocuments(filter),
    ]);

    const unreadCount = await Notification.countDocuments({ ...filter, isRead: false });

    return paginated(res, notifications, { ...buildPaginationMeta(total, page, limit), unreadCount });
  } catch (err) {
    console.error('Get notifications error:', err);
    return error(res, 'Failed to fetch notifications', 500);
  }
};

// POST /notifications
const createNotification = async (req, res) => {
  try {
    const { franchiseId, branchId, title, body, type, targetRole, targetUsers, expiresAt, metadata } = req.body;
    if (!title || !body) return error(res, 'Title and body are required', 400);

    const notification = await Notification.create({
      franchiseId: franchiseId || req.user.franchiseId || null,
      branchId: branchId || null,
      title, body,
      type: type || 'info',
      targetRole: targetRole || [],
      targetUsers: targetUsers || [],
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      metadata: metadata || {},
      createdBy: req.user._id,
    });

    return created(res, notification, 'Notification created');
  } catch (err) {
    console.error('Create notification error:', err);
    return error(res, 'Failed to create notification', 500);
  }
};

// PATCH /notifications/read
const markAsRead = async (req, res) => {
  try {
    const { ids, readAll } = req.body;

    if (readAll) {
      const filter = {};
      if (req.user.role !== 'system_admin') {
        filter.$or = [{ targetRole: req.user.role }, { targetUsers: req.user._id }];
      }
      await Notification.updateMany(filter, {
        isRead: true,
        $addToSet: { readBy: { userId: req.user._id, readAt: new Date() } },
      });
      return success(res, null, 'All notifications marked as read');
    }

    if (ids && ids.length > 0) {
      await Notification.updateMany(
        { _id: { $in: ids } },
        { isRead: true, $addToSet: { readBy: { userId: req.user._id, readAt: new Date() } } }
      );
      return success(res, null, `${ids.length} notification(s) marked as read`);
    }

    return error(res, 'Provide ids or readAll=true', 400);
  } catch (err) {
    console.error('Mark as read error:', err);
    return error(res, 'Failed to mark notifications as read', 500);
  }
};

// DELETE /notifications/:id
const deleteNotification = async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) return notFound(res, 'Notification not found');
    await Notification.findByIdAndDelete(req.params.id);
    return success(res, null, 'Notification deleted');
  } catch (err) {
    console.error('Delete notification error:', err);
    return error(res, 'Failed to delete notification', 500);
  }
};

module.exports = { getNotifications, createNotification, markAsRead, deleteNotification };
