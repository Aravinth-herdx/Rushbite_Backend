const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema(
  {
    franchiseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Franchise', required: true, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', index: true, default: null },
    menuItemIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem' }],
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', sparse: true, default: null },
    customerName: { type: String, default: 'Anonymous' },
    customerPhone: { type: String, default: '' },
    rating: { type: Number, required: true, min: 1, max: 5, index: true },
    comment: { type: String, default: '' },
    category: {
      type: String,
      enum: ['food_quality', 'service', 'cleanliness', 'value', 'overall'],
      default: 'overall',
    },
    isAnonymous: { type: Boolean, default: false },
    isResolved: { type: Boolean, default: false },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedAt: { type: Date },
    resolveNote: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Feedback', feedbackSchema);
