const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    franchiseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Franchise', index: true, default: null },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', sparse: true, default: null },
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true },
    type: {
      type: String,
      enum: ['info', 'warning', 'error', 'success', 'order', 'inventory', 'system'],
      default: 'info',
      index: true,
    },
    targetRole: [{ type: String }],
    targetUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    isRead: { type: Boolean, default: false, index: true },
    readBy: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        readAt: { type: Date, default: Date.now },
        _id: false,
      },
    ],
    expiresAt: { type: Date, index: { expireAfterSeconds: 0 } },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

notificationSchema.index({ franchiseId: 1, targetRole: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
