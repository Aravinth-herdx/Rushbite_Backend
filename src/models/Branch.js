const mongoose = require('mongoose');

const branchSchema = new mongoose.Schema(
  {
    franchiseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Franchise', required: true, index: true },
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, index: true },
    address: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    phone: { type: String, default: '' },
    email: { type: String, default: '' },
    managerName: { type: String, default: '' },
    isActive: { type: Boolean, default: true, index: true },
    isDeleted: { type: Boolean, default: false },

    // Which days of the week this branch operates
    workingDays: {
      monday:    { type: Boolean, default: true },
      tuesday:   { type: Boolean, default: true },
      wednesday: { type: Boolean, default: true },
      thursday:  { type: Boolean, default: true },
      friday:    { type: Boolean, default: true },
      saturday:  { type: Boolean, default: true },
      sunday:    { type: Boolean, default: false },
    },

    // Overall branch open/close window (IST, stored as "HH:mm")
    workingHours: {
      openTime:  { type: String, default: '07:00' },
      closeTime: { type: String, default: '22:00' },
    },

    // Named service-time slots with IST start/end times
    serviceWindows: [
      {
        name:      { type: String },
        startTime: { type: String },
        endTime:   { type: String },
        isActive:  { type: Boolean, default: true },
      },
    ],

    // Specific dates this branch will be closed
    holidays: [
      {
        date:   { type: String },   // YYYY-MM-DD
        reason: { type: String, default: '' },
      },
    ],

    stats: {
      totalOrders:   { type: Number, default: 0 },
      pendingOrders: { type: Number, default: 0 },
      todayRevenue:  { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

branchSchema.index({ franchiseId: 1, isActive: 1 });

module.exports = mongoose.model('Branch', branchSchema);
