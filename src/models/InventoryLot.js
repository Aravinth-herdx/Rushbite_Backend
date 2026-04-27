// InventoryLot — tracks each supplier purchase as a separate lot.
// When stock is consumed FIFO, quantityRemaining is decremented oldest-first.
const mongoose = require('mongoose');

const inventoryLotSchema = new mongoose.Schema(
  {
    itemId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Inventory', required: true, index: true },
    itemName: { type: String, default: '' }, // Denormalized for fast queries
    franchiseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Franchise', required: true, index: true },
    branchId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Branch',    default: null, index: true },

    // Supplier details for this purchase
    supplier: {
      name:      { type: String, default: '' },
      contact:   { type: String, default: '' },
      invoiceNo: { type: String, default: '' },
    },

    purchaseDate:      { type: Date, default: Date.now },
    unitPrice:         { type: Number, default: 0 },         // Price paid per unit
    quantityPurchased: { type: Number, required: true },      // Original quantity
    quantityRemaining: { type: Number, required: true },      // Decremented on consumption
    batchNo:           { type: String, default: '' },
    expiryDate:        { type: Date, default: null },

    // Link back to the STOCK_IN movement that created this lot
    movementId: { type: mongoose.Schema.Types.ObjectId, ref: 'StockMovement', default: null },

    isActive:  { type: Boolean, default: true }, // false when fully consumed
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

inventoryLotSchema.index({ itemId: 1, purchaseDate: 1 });           // FIFO order
inventoryLotSchema.index({ franchiseId: 1, isActive: 1 });
inventoryLotSchema.index({ 'supplier.name': 1, itemId: 1 });

inventoryLotSchema.virtual('quantityConsumed').get(function () {
  return this.quantityPurchased - this.quantityRemaining;
});

inventoryLotSchema.virtual('totalCost').get(function () {
  return this.quantityPurchased * this.unitPrice;
});

inventoryLotSchema.set('toJSON', { virtuals: true });
inventoryLotSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('InventoryLot', inventoryLotSchema);
