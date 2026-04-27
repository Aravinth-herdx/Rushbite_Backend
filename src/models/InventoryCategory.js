const mongoose = require('mongoose');

const inventoryCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    color: { type: String, default: '#6B7280' },
    icon: { type: String, default: 'category' },
    image: { type: String, default: '' },
    franchiseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Franchise', index: true, default: null },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true, default: null },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

inventoryCategorySchema.index({ franchiseId: 1, isDeleted: 1 });

module.exports = mongoose.model('InventoryCategory', inventoryCategorySchema);
