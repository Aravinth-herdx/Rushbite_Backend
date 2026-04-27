// models/DailySummary.js
// Maintains per-branch running totals for each calendar day.
// Updated atomically on every order event — dashboard reads are O(1).

const mongoose = require('mongoose');

const dailySummarySchema = new mongoose.Schema(
  {
    // 'YYYY-MM-DD' in IST (UTC+5:30) so midnight resets match the business day
    date:        { type: String, required: true, index: true },
    franchiseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Franchise', required: true },
    branchId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Branch',    required: true },

    // Running order counts
    totalOrders: { type: Number, default: 0 },
    totalRevenue:{ type: Number, default: 0 },

    // Status buckets (incremented/decremented as orders move through statuses)
    received:  { type: Number, default: 0 },
    accepted:  { type: Number, default: 0 },
    preparing: { type: Number, default: 0 },
    ready:     { type: Number, default: 0 },
    served:    { type: Number, default: 0 },
    cancelled: { type: Number, default: 0 },
    walkIn:    { type: Number, default: 0 },

    // Service window breakdown  { 'Breakfast': 12, 'Lunch': 34, ... }
    byWindow: { type: Map, of: Number, default: {} },
  },
  { timestamps: true }
);

// Unique per branch per day — upsert key
dailySummarySchema.index({ date: 1, franchiseId: 1, branchId: 1 }, { unique: true });
// Fast cross-branch franchise rollup
dailySummarySchema.index({ date: 1, franchiseId: 1 });

module.exports = mongoose.model('DailySummary', dailySummarySchema);
