const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { ROLES } = require('../config/constants');

const userSchema = new mongoose.Schema(
  {
    employeeId: { type: String, unique: true, sparse: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    phone: { type: String, trim: true, index: true },
    password: { type: String, select: false },
    role: {
      type: String,
      required: true,
      index: true,
    },
    avatar: { type: String, default: '' },
    department: { type: String, default: '' },
    // Tag to categorise the user in the mobile app (employee, manager, kitchen, counter, etc.)
    employeeTag: { type: String, default: 'employee', index: true },
    isActive: { type: Boolean, default: true, index: true },
    franchiseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Franchise', index: true, default: null },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true, default: null },
    // Multi-branch role assignments: one user can hold different roles at different branches
    branchRoles: [
      {
        branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
        franchiseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Franchise', required: true },
        role: { type: String, required: true },
      },
    ],
    permissions: {
      viewOrders: { type: Boolean, default: false },
      updateOrderStatus: { type: Boolean, default: false },
      cancelOrder: { type: Boolean, default: false },
      manageMenu: { type: Boolean, default: false },
      viewReports: { type: Boolean, default: false },
      manageInventory: { type: Boolean, default: false },
      manageUsers: { type: Boolean, default: false },
      manageRoles: { type: Boolean, default: false },
      manageSettings: { type: Boolean, default: false },
      processWalkin: { type: Boolean, default: false },
      validateToken: { type: Boolean, default: false },
      processPayment: { type: Boolean, default: false },
      viewAuditTrail: { type: Boolean, default: false },
      manageFranchise: { type: Boolean, default: false },
      manageBranch: { type: Boolean, default: false },
      managePromotions: { type: Boolean, default: false },
      viewFeedback: { type: Boolean, default: false },
      sendNotifications: { type: Boolean, default: false },
      manageNotifications: { type: Boolean, default: false },
      viewDashboard: { type: Boolean, default: false },
    },
    lastLogin: { type: Date },
    lastOpened: { type: Date },
    appVersion: { type: String, default: '' },
    deviceInfo: { type: mongoose.Schema.Types.Mixed, default: null },
    loginCount: { type: Number, default: 0 },
    passwordChangedAt: { type: Date },
    refreshTokenHash: { type: String, select: false },
    otp: { type: String, select: false },
    otpExpiry: { type: Date, select: false },
    isDeleted: { type: Boolean, default: false, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound indexes
userSchema.index({ role: 1, isActive: 1 });
userSchema.index({ franchiseId: 1, branchId: 1, isActive: 1 });
userSchema.index({ isDeleted: 1, isActive: 1 });

// Virtuals
userSchema.virtual('fullName').get(function () {
  return this.name;
});

userSchema.virtual('initials').get(function () {
  const parts = this.name.trim().split(' ');
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return this.name.length > 0 ? this.name[0].toUpperCase() : 'U';
});

// Pre-save: hash password if modified
userSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  this.passwordChangedAt = new Date();
  next();
});

// Instance method: compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

// Static: generate employee ID
userSchema.statics.generateEmployeeId = async function () {
  const year = new Date().getFullYear();
  const count = await this.countDocuments({});
  const padded = String(count + 1).padStart(4, '0');
  return `EMP${year}${padded}`;
};

module.exports = mongoose.model('User', userSchema);
