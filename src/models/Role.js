const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true, lowercase: true },
    displayName: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    permissions: {
      viewOrders: { type: Boolean, default: false },
      updateOrderStatus: { type: Boolean, default: false },
      cancelOrders: { type: Boolean, default: false },
      viewMenu: { type: Boolean, default: false },
      manageMenu: { type: Boolean, default: false },
      viewReports: { type: Boolean, default: false },
      exportReports: { type: Boolean, default: false },
      manageUsers: { type: Boolean, default: false },
      manageRoles: { type: Boolean, default: false },
      manageSettings: { type: Boolean, default: false },
      viewInventory: { type: Boolean, default: false },
      manageInventory: { type: Boolean, default: false },
      managePromotions: { type: Boolean, default: false },
      handleWalkin: { type: Boolean, default: false },
      validateTokens: { type: Boolean, default: false },
      viewAuditTrail: { type: Boolean, default: false },
      manageNotifications: { type: Boolean, default: false },
      manageAvailability: { type: Boolean, default: false },
      viewAnalytics: { type: Boolean, default: false },
      managePayments: { type: Boolean, default: false },
    },
    franchiseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Franchise', default: null, index: true },
    isSystem: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
    userCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Role', roleSchema);
