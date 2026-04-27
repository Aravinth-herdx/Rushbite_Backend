const mongoose = require('mongoose');

const menuCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    franchiseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Franchise', required: true, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true, default: null },
    displayOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

menuCategorySchema.index({ franchiseId: 1, branchId: 1, isDeleted: 1 });

module.exports = mongoose.model('MenuCategory', menuCategorySchema);
