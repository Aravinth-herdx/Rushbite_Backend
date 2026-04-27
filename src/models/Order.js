const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema(
  {
    menuItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem' },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    tax: { type: Number, default: 0 },
    quantity: { type: Number, required: true, min: 1 },
    specialNote: { type: String, default: '' },
    subtotal: { type: Number, required: true },
  },
  { _id: false }
);

const statusHistorySchema = new mongoose.Schema(
  {
    status: { type: String },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedAt: { type: Date, default: Date.now },
    note: { type: String, default: '' },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    tokenNumber: { type: String, index: true },
    franchiseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Franchise', required: true, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', sparse: true, default: null },
    customerName: { type: String, default: 'Walk-in Customer' },
    customerPhone: { type: String, default: '' },
    isWalkin: { type: Boolean, default: false, index: true },
    items: [orderItemSchema],
    status: {
      type: String,
      enum: ['received', 'accepted', 'preparing', 'ready', 'served', 'cancelled'],
      default: 'received',
      index: true,
    },
    subtotal: { type: Number, required: true },
    taxAmount: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },
    paymentMode: {
      type: String,
      enum: ['cash', 'upi', 'card', 'wallet', 'company'],
      default: 'cash',
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'refunded'],
      default: 'pending',
      index: true,
    },
    promotionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Promotion', sparse: true, default: null },
    serviceWindow: { type: String, default: '' },
    pickupSlot: { type: String, default: '' },
    notes: { type: String, default: '' },
    statusHistory: [statusHistorySchema],
    servedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', sparse: true, default: null },
    cancelReason: { type: String, default: '' },
    isDeleted: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// Performance indexes
orderSchema.index({ franchiseId: 1, branchId: 1, status: 1, createdAt: -1 });
orderSchema.index({ franchiseId: 1, branchId: 1, createdAt: -1 });
orderSchema.index({ customerId: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ tokenNumber: 1, franchiseId: 1 });
orderSchema.index({ createdAt: -1 });

// Compound indexes for fast dashboard aggregation fallback & report queries
orderSchema.index({ franchiseId: 1, createdAt: -1 });
orderSchema.index({ franchiseId: 1, branchId: 1, createdAt: -1 });
orderSchema.index({ franchiseId: 1, branchId: 1, status: 1, createdAt: -1 });
orderSchema.index({ franchiseId: 1, status: 1, createdAt: -1 });
orderSchema.index({ branchId: 1, createdAt: -1 });

module.exports = mongoose.model('Order', orderSchema);
