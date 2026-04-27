const mongoose = require('mongoose');

const MOVEMENT_TYPES = ['STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT', 'INITIAL', 'EXPIRED', 'DAMAGED'];

const stockMovementSchema = new mongoose.Schema(
  {
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Inventory', required: true, index: true },
    itemName: { type: String, default: '' }, // Denormalized for fast queries
    franchiseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Franchise', index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
    type: { type: String, enum: MOVEMENT_TYPES, required: true, index: true },
    quantity: { type: Number, required: true, min: 0 }, // Always positive; type determines direction
    stockBefore: { type: Number, required: true },
    stockAfter: { type: Number, required: true },
    reason: { type: String, default: '' },
    // Supplier info (relevant for STOCK_IN)
    supplier: {
      name: { type: String, default: '' },
      contact: { type: String, default: '' },
      invoiceNo: { type: String, default: '' },
    },
    unitPrice: { type: Number, default: 0 }, // Price paid per unit this batch
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    performedByName: { type: String, default: '' }, // Denormalized
    notes: { type: String, default: '' },
    attachments: [{ type: String }], // Proof image URLs
  },
  { timestamps: true }
);

stockMovementSchema.index({ itemId: 1, createdAt: -1 });
stockMovementSchema.index({ franchiseId: 1, createdAt: -1 });
stockMovementSchema.index({ branchId: 1, createdAt: -1 });
stockMovementSchema.index({ type: 1, createdAt: -1 });

module.exports = mongoose.model('StockMovement', stockMovementSchema);
module.exports.MOVEMENT_TYPES = MOVEMENT_TYPES;
