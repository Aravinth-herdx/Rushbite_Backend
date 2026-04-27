// src/models/Supplier.js
const mongoose = require('mongoose');

const supplierSchema = new mongoose.Schema(
  {
    name:         { type: String, required: true, trim: true },
    contactName:  { type: String, default: '', trim: true },
    phone:        { type: String, default: '', trim: true },
    email:        { type: String, default: '', trim: true, lowercase: true },
    address:      { type: String, default: '', trim: true },
    gstNo:        { type: String, default: '', trim: true },
    franchiseId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Franchise', default: null, index: true },
    linkedBranchIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Branch' }],
    isActive:     { type: Boolean, default: true },
    isDeleted:    { type: Boolean, default: false },
  },
  { timestamps: true }
);

supplierSchema.index({ name: 1, franchiseId: 1 });

module.exports = mongoose.model('Supplier', supplierSchema);
