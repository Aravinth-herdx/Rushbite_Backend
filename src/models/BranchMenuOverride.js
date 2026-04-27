const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  menuItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem', required: true, index: true },
  franchiseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Franchise', required: true, index: true },
  branchId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
  isLinked:    { type: Boolean, default: true },   // false = explicitly hidden for this branch
  priceOverride: { type: Number, default: null },  // null = use base price
  isAvailableOverride: { type: Boolean, default: null }, // null = use base
  serviceWindowOverride: { type: [String], default: null }, // null = use base
  dailyLimitOverride: { type: Number, default: null }, // null = use base
}, { timestamps: true });

schema.index({ menuItemId: 1, branchId: 1 }, { unique: true });
schema.index({ franchiseId: 1, branchId: 1 });

module.exports = mongoose.model('BranchMenuOverride', schema);
