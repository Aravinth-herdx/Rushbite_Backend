const mongoose = require('mongoose');

const franchiseSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    ownerName: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },
    address: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    pincode: { type: String, default: '' },
    gstin: { type: String, default: '' },
    logo: { type: String, default: '' },
    isActive: { type: Boolean, default: true, index: true },
    isDeleted: { type: Boolean, default: false },
    stats: {
      totalBranches: { type: Number, default: 0 },
      activeBranches: { type: Number, default: 0 },
      totalOrders: { type: Number, default: 0 },
      monthlyRevenue: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Franchise', franchiseSchema);
