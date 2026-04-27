const mongoose = require('mongoose');

const promotionSchema = new mongoose.Schema(
  {
    franchiseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Franchise', required: true, index: true },
    code: { type: String, required: true, uppercase: true, trim: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    discountType: { type: String, enum: ['percent', 'flat'], required: true },
    discountValue: { type: Number, required: true, min: 0 },
    maxDiscount: { type: Number, default: 0 },
    minOrderValue: { type: Number, default: 0 },
    validFrom: { type: Date, required: true, index: true },
    validUntil: { type: Date, required: true, index: true },
    isActive: { type: Boolean, default: true, index: true },
    usageLimit: { type: Number, default: 0 },
    usageCount: { type: Number, default: 0 },
    applicableWindow: [{ type: String }],
    applicableItems: [{ type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem' }],
    isDeleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

promotionSchema.virtual('isExpired').get(function () {
  return new Date() > this.validUntil;
});

promotionSchema.virtual('isExhausted').get(function () {
  return this.usageLimit > 0 && this.usageCount >= this.usageLimit;
});

promotionSchema.virtual('discountLabel').get(function () {
  return this.discountType === 'percent'
    ? `${this.discountValue}% OFF`
    : `₹${this.discountValue} OFF`;
});

module.exports = mongoose.model('Promotion', promotionSchema);
