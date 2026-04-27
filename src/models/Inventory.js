const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema(
  {
    franchiseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Franchise', required: true, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true, default: null },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryCategory', index: true, default: null },
    categoryName: { type: String, default: '' }, // Denormalized for fast list queries
    name: { type: String, required: true, trim: true },
    unit: { type: String, default: 'kg' },
    currentStock: { type: Number, default: 0 },
    minStock: { type: Number, default: 10 },
    maxStock: { type: Number, default: 100 },
    alertThreshold: { type: Number, default: null }, // Custom alert level; falls back to minStock
    costPerUnit: { type: Number, default: 0 }, // Last known cost per unit
    supplier: { type: String, default: '' }, // Last known supplier name
    image: { type: String, default: '' },
    expiryDate: { type: Date, default: null }, // For food safety tracking
    batchNo: { type: String, default: '' },
    lastRestocked: { type: Date },
    isDeleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

inventorySchema.index({ franchiseId: 1, categoryId: 1 });
inventorySchema.index({ franchiseId: 1, currentStock: 1, minStock: 1 });
inventorySchema.index({ franchiseId: 1, isDeleted: 1, name: 1 });

inventorySchema.virtual('effectiveAlertThreshold').get(function () {
  return this.alertThreshold != null ? this.alertThreshold : this.minStock;
});

inventorySchema.virtual('isLow').get(function () {
  const threshold = this.alertThreshold != null ? this.alertThreshold : this.minStock;
  return this.currentStock <= threshold;
});

inventorySchema.virtual('isCritical').get(function () {
  const threshold = this.alertThreshold != null ? this.alertThreshold : this.minStock;
  return this.currentStock <= threshold * 0.3;
});

inventorySchema.virtual('stockPercent').get(function () {
  if (this.maxStock <= 0) return 0;
  return Math.min(1, this.currentStock / this.maxStock);
});

inventorySchema.virtual('stockStatus').get(function () {
  const threshold = this.alertThreshold != null ? this.alertThreshold : this.minStock;
  if (this.currentStock <= threshold * 0.3) return 'critical';
  if (this.currentStock <= threshold) return 'low';
  return 'ok';
});

inventorySchema.virtual('isNearExpiry').get(function () {
  if (!this.expiryDate) return false;
  const daysUntilExpiry = (this.expiryDate - new Date()) / (1000 * 60 * 60 * 24);
  return daysUntilExpiry <= 7;
});

inventorySchema.virtual('isExpired').get(function () {
  if (!this.expiryDate) return false;
  return this.expiryDate < new Date();
});

module.exports = mongoose.model('Inventory', inventorySchema);
