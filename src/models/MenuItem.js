const mongoose = require('mongoose');
const { Schema, Types: { ObjectId } } = mongoose;

/**
 * MenuItem — real-world cafeteria menu item.
 *
 * Key design decisions:
 *  - categoryId  (ObjectId → MenuCategory) replaces the old `category` string field
 *  - No `stock`  — stock/inventory lives in the Inventory model, not here
 *  - No `carryToNextWindow` / `linkedBranches` — simplified for clarity
 *  - orderCount / viewCount track popularity for smart recommendations
 *  - allergens, calories, spiceLevel support health-conscious menus
 */
const menuItemSchema = new Schema(
  {
    franchiseId:  { type: Schema.Types.ObjectId, ref: 'Franchise',    required: true, index: true },
    branchId:     { type: Schema.Types.ObjectId, ref: 'Branch',       default: null,  index: true },

    // ── Category reference ──────────────────────────────────────────────────
    // Always an ObjectId — no more category-name strings anywhere.
    categoryId:   { type: Schema.Types.ObjectId, ref: 'MenuCategory', required: true, index: true },

    // ── Identity ────────────────────────────────────────────────────────────
    itemCode:     { type: String, unique: true, sparse: true, trim: true },
    name:         { type: String, required: true, trim: true },
    description:  { type: String, default: '' },

    // ── Pricing ─────────────────────────────────────────────────────────────
    price:         { type: Number, required: true, min: 0 },
    originalPrice: { type: Number, default: null },   // set when item is on discount
    tax:           { type: Number, default: 0, min: 0 },

    // ── Media ───────────────────────────────────────────────────────────────
    images: [{ type: String }],   // up to 5; first is primary

    // ── Flags ───────────────────────────────────────────────────────────────
    isVeg:       { type: Boolean, default: true,  index: true },
    isAvailable: { type: Boolean, default: true,  index: true },
    isGlobal:    { type: Boolean, default: true,  index: true }, // true = all branches

    // ── Menu properties ─────────────────────────────────────────────────────
    isBestseller: { type: Boolean, default: false },
    isNew:        { type: Boolean, default: false },
    isSpicy:      { type: Boolean, default: false },
    // 0 = not spicy / mild, 1 = medium, 2 = hot, 3 = extra hot
    spiceLevel:   { type: Number,  default: 0, min: 0, max: 3 },
    calories:     { type: Number,  default: null },   // kcal; null = not disclosed
    preparationTime: { type: Number, default: 10 },   // minutes
    displayOrder: { type: Number,  default: 0 },
    tags:         [{ type: String }],                 // custom tags e.g. ['Jain', 'Keto']
    allergens:    [{ type: String }],                 // e.g. ['gluten', 'dairy', 'nuts', 'eggs']

    // ── Service windows ─────────────────────────────────────────────────────
    // Names must match Branch.serviceWindows[].name exactly for live filtering.
    serviceWindow: [{ type: String }],

    // ── Ratings ─────────────────────────────────────────────────────────────
    ratings: {
      average: { type: Number, default: 0 },
      count:   { type: Number, default: 0 },
      total:   { type: Number, default: 0 },
    },

    // ── Popularity / interest ────────────────────────────────────────────────
    orderCount: { type: Number, default: 0 }, // incremented on each order
    viewCount:  { type: Number, default: 0 }, // incremented on item detail fetch

    // ── Daily ops (kitchen-side, not shown to customers) ────────────────────
    dailyLimit:      { type: Number, default: 0 }, // 0 = unlimited
    dailySoldCount:  { type: Number, default: 0 },
    dailyResetDate:  { type: Date,   default: null },

    // ── Add-ons ─────────────────────────────────────────────────────────────
    addons: [
      {
        name:          { type: String, trim: true },
        price:         { type: Number, default: 0 },
        originalPrice: { type: Number, default: null },
        isRequired:    { type: Boolean, default: false },
        maxQty:        { type: Number,  default: 1 },
        description:   { type: String,  default: '' },
        _id: false,
      },
    ],

    // ── Custom key-value pairs (franchise/branch specific) ───────────────────
    customProperties: [
      { key: { type: String, trim: true }, value: { type: String, trim: true }, _id: false },
    ],

    // ── Soft delete + audit ─────────────────────────────────────────────────
    isDeleted:  { type: Boolean, default: false },
    createdBy:  { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy:  { type: Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    toJSON:   { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
menuItemSchema.index({ franchiseId: 1, categoryId: 1, isAvailable: 1 });
menuItemSchema.index({ franchiseId: 1, serviceWindow: 1, isAvailable: 1 });
menuItemSchema.index({ franchiseId: 1, isDeleted: 1, isAvailable: 1 });
menuItemSchema.index({ franchiseId: 1, isGlobal: 1, isDeleted: 1 });
menuItemSchema.index({ orderCount: -1 });   // for top-performers query
menuItemSchema.index({ 'ratings.average': -1 }); // for recommendations

// ── Virtuals ─────────────────────────────────────────────────────────────────
menuItemSchema.virtual('effectivePrice').get(function () {
  return this.originalPrice != null ? this.price : this.price;
});

menuItemSchema.virtual('hasDiscount').get(function () {
  return this.originalPrice != null && this.originalPrice > this.price;
});

menuItemSchema.virtual('discountPercent').get(function () {
  if (!this.hasDiscount) return 0;
  return Math.round(((this.originalPrice - this.price) / this.originalPrice) * 100);
});

// ── Auto-generate item code ───────────────────────────────────────────────────
menuItemSchema.pre('save', async function (next) {
  if (!this.itemCode) {
    const count = await mongoose.model('MenuItem').countDocuments({});
    this.itemCode = `ITEM${String(count + 1).padStart(4, '0')}`;
  }
  next();
});

module.exports = mongoose.model('MenuItem', menuItemSchema);
