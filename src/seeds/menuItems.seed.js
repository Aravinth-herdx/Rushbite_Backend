/**
 * Menu Items Seed Script
 * ---------------------
 * Franchise : 69c5feac62ec8cd3444de6c5
 * Branch    : 69c5feac62ec8cd3444de6e3  (HITEC City Branch)
 *
 * Service windows (must match Branch.serviceWindows[].name exactly):
 *   "Breakfast"              07:00 – 10:00
 *   "Lunch"                  12:30 – 15:00
 *   "Evening Snacks / Tea"   16:00 – 18:00
 *
 * Run: node src/seeds/menuItems.seed.js
 *      node src/seeds/menuItems.seed.js --clear   (wipe branch items first)
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const MenuItem = require('../models/MenuItem');

const FRANCHISE_ID = '69c5feac62ec8cd3444de6c5';
const BRANCH_ID    = '69c5feac62ec8cd3444de6e3';

// ── Category registry ─────────────────────────────────────────────────────────
// wins = exact service window names matching Branch.serviceWindows[].name
const CATEGORIES = {
  Breakfast:     { id: '69ce15e63d4a514f55dabb8a', wins: ['Breakfast'] },
  Lunch:         { id: '69ce15ed3d4a514f55dabb93', wins: ['Lunch'] },
  Snacks:        { id: '69ce15f63d4a514f55dabb99', wins: ['Evening Snacks / Tea'] },
  Beverages:     { id: '69ce15ff3d4a514f55dabba2', wins: ['Breakfast', 'Lunch', 'Evening Snacks / Tea'] },
  Dinner:        { id: '69ce16063d4a514f55dabba8', wins: ['Lunch'] },  // lunch doubles as dinner here
  'Combo Meals': { id: '69ce16103d4a514f55dabbb1', wins: null },       // set per item
  Desserts:      { id: '69ce17d93d4a514f55dabc19', wins: ['Lunch', 'Evening Snacks / Tea'] },
  Healthy:       { id: '69ce17de3d4a514f55dabc22', wins: ['Breakfast', 'Lunch'] },
};

// Multiple image helper — generates 3 deterministic images per item using different suffixes
const imgs = (seed) => [
  `https://picsum.photos/seed/${encodeURIComponent(seed)}/600/400`,
  `https://picsum.photos/seed/${encodeURIComponent(seed + '_b')}/600/400`,
  `https://picsum.photos/seed/${encodeURIComponent(seed + '_c')}/600/400`,
];

// ── Raw seed data ─────────────────────────────────────────────────────────────
const RAW = [
  // ── Breakfast ──────────────────────────────────────────────────────────────
  { name: 'Idli Sambar',    description: 'Steamed rice cakes with sambar & fresh chutney', price:  40, isVeg: true,  cat: 'Breakfast', dailyLimit: 150, calories: 180, isBestseller: true  },
  { name: 'Masala Dosa',    description: 'Crispy dosa with spiced potato filling',          price:  60, isVeg: true,  cat: 'Breakfast', dailyLimit: 120, calories: 260, isBestseller: true  },
  { name: 'Plain Dosa',     description: 'Classic crispy dosa served with chutney',         price:  50, isVeg: true,  cat: 'Breakfast', dailyLimit: 100, calories: 210 },
  { name: 'Onion Uttapam',  description: 'Thick fluffy dosa topped with fresh onions',      price:  70, isVeg: true,  cat: 'Breakfast', dailyLimit:  80, calories: 230 },
  { name: 'Pongal',         description: 'Creamy rice-lentil dish with ghee & pepper',      price:  50, isVeg: true,  cat: 'Breakfast', dailyLimit: 100, calories: 280 },
  { name: 'Poori Masala',   description: 'Golden fried bread with spicy potato curry',      price:  55, isVeg: true,  cat: 'Breakfast', dailyLimit:  90, calories: 320 },
  { name: 'Vada',           description: 'Crispy urad dal fritters with sambar',            price:  30, isVeg: true,  cat: 'Breakfast', dailyLimit: 120, calories: 145 },
  { name: 'Mini Tiffin',    description: 'Combo of idli, dosa & pongal',                    price: 100, isVeg: true,  cat: 'Breakfast', dailyLimit:  70, calories: 450, isBestseller: true  },
  { name: 'Bread Omelette', description: 'Toasted bread with spiced masala omelette',       price:  45, isVeg: false, cat: 'Breakfast', dailyLimit:  80, calories: 300 },
  { name: 'Egg Bhurji',     description: 'Scrambled eggs Indian style with onions & spices',price:  60, isVeg: false, cat: 'Breakfast', dailyLimit:  60, calories: 260, isSpicy: true, spiceLevel: 1 },
  { name: 'Oats Porridge',  description: 'Healthy rolled oats with milk',                   price:  45, isVeg: true,  cat: 'Breakfast', dailyLimit:  60, calories: 160, isNew: true  },
  { name: 'Ragi Malt',      description: 'Nutritious finger millet health drink',           price:  35, isVeg: true,  cat: 'Breakfast', dailyLimit:  70, calories: 120, isNew: true  },
  { name: 'Millet Upma',    description: 'Healthy millet-based upma with vegetables',       price:  50, isVeg: true,  cat: 'Breakfast', dailyLimit:  80, calories: 190, isNew: true  },

  // ── Lunch ──────────────────────────────────────────────────────────────────
  { name: 'Veg Meals',             description: 'Rice, sambar, rasam, poriyal & curd',            price:  90, isVeg: true,  cat: 'Lunch', dailyLimit: 200, calories: 650, isBestseller: true  },
  { name: 'Chicken Meals',         description: 'Steamed rice with rich chicken curry',            price: 130, isVeg: false, cat: 'Lunch', dailyLimit: 120, calories: 780, isBestseller: true, isSpicy: true, spiceLevel: 2 },
  { name: 'Mutton Meals',          description: 'Tender mutton gravy with basmati rice',           price: 180, isVeg: false, cat: 'Lunch', dailyLimit:  60, calories: 820, isSpicy: true, spiceLevel: 2 },
  { name: 'Lemon Rice',            description: 'Tangy turmeric rice with peanuts & curry leaves', price:  60, isVeg: true,  cat: 'Lunch', dailyLimit:  80, calories: 340 },
  { name: 'Curd Rice',             description: 'Cooling yogurt rice with mustard & pomegranate',  price:  50, isVeg: true,  cat: 'Lunch', dailyLimit: 100, calories: 290 },
  { name: 'Tomato Rice',           description: 'Spiced tangy tomato flavored rice',               price:  60, isVeg: true,  cat: 'Lunch', dailyLimit:  80, calories: 320 },
  { name: 'Veg Fried Rice',        description: 'Indo-Chinese stir-fried rice with vegetables',    price:  90, isVeg: true,  cat: 'Lunch', dailyLimit: 110, calories: 420 },
  { name: 'Chicken Fried Rice',    description: 'Wok-fried rice with tender chicken',              price: 120, isVeg: false, cat: 'Lunch', dailyLimit:  90, calories: 510, isSpicy: true, spiceLevel: 1 },
  { name: 'Paneer Butter Masala',  description: 'Creamy tomato-based paneer curry',                price: 140, isVeg: true,  cat: 'Lunch', dailyLimit:  70, calories: 480, isBestseller: true  },
  { name: 'Chapati Set',           description: 'Soft wheat chapati with seasonal veg curry',      price:  60, isVeg: true,  cat: 'Lunch', dailyLimit: 120, calories: 310 },

  // ── Snacks (→ Evening Snacks / Tea window) ─────────────────────────────────
  { name: 'Samosa',           description: 'Crispy fried pastry with spiced potato filling',       price:  20, isVeg: true,  cat: 'Snacks', dailyLimit: 200, calories: 130, isBestseller: true  },
  { name: 'Veg Puff',         description: 'Flaky bakery puff with spiced vegetable filling',      price:  25, isVeg: true,  cat: 'Snacks', dailyLimit: 150, calories: 160 },
  { name: 'Egg Puff',         description: 'Golden puff stuffed with egg masala',                  price:  30, isVeg: false, cat: 'Snacks', dailyLimit: 120, calories: 195 },
  { name: 'Chicken Puff',     description: 'Buttery puff with spicy chicken filling',              price:  40, isVeg: false, cat: 'Snacks', dailyLimit: 100, calories: 220, isSpicy: true, spiceLevel: 1 },
  { name: 'Veg Sandwich',     description: 'Soft bread with fresh veggies & green chutney',        price:  50, isVeg: true,  cat: 'Snacks', dailyLimit: 100, calories: 240 },
  { name: 'Grilled Sandwich', description: 'Toasted sandwich with melted cheese & tomato',         price:  70, isVeg: true,  cat: 'Snacks', dailyLimit:  80, calories: 310 },
  { name: 'Chicken Roll',     description: 'Soft paratha roll with spicy chicken filling',         price:  80, isVeg: false, cat: 'Snacks', dailyLimit:  80, calories: 370, isSpicy: true, spiceLevel: 2 },
  { name: 'French Fries',     description: 'Crispy golden salted fries',                           price:  60, isVeg: true,  cat: 'Snacks', dailyLimit: 120, calories: 290 },
  { name: 'Onion Pakoda',     description: 'Crispy deep-fried onion & gram flour fritters',        price:  40, isVeg: true,  cat: 'Snacks', dailyLimit: 100, calories: 210, isBestseller: true  },
  { name: 'Cutlet',           description: 'Spiced mixed veg patties fried crisp',                 price:  50, isVeg: true,  cat: 'Snacks', dailyLimit:  90, calories: 185 },
  { name: 'Veg Wrap',         description: 'Whole wheat wrap with grilled veggies & sauce',        price:  70, isVeg: true,  cat: 'Snacks', dailyLimit:  90, calories: 280 },
  { name: 'Chicken Wrap',     description: 'Whole wheat wrap with grilled chicken & coleslaw',     price:  90, isVeg: false, cat: 'Snacks', dailyLimit:  80, calories: 360, isSpicy: true, spiceLevel: 1 },

  // ── Beverages (available all windows) ──────────────────────────────────────
  { name: 'Tea',              description: 'Indian masala milk tea',                               price:  15, isVeg: true, cat: 'Beverages', dailyLimit: 300, calories:  60, isBestseller: true  },
  { name: 'Filter Coffee',    description: 'Strong South Indian drip coffee with milk',            price:  20, isVeg: true, cat: 'Beverages', dailyLimit: 250, calories:  70, isBestseller: true  },
  { name: 'Black Coffee',     description: 'Bold black coffee without milk',                       price:  25, isVeg: true, cat: 'Beverages', dailyLimit: 120, calories:   5 },
  { name: 'Fresh Lime Juice', description: 'Chilled sweet or salted lime juice',                   price:  30, isVeg: true, cat: 'Beverages', dailyLimit: 120, calories:  45 },
  { name: 'Badam Milk',       description: 'Warm almond-flavored sweetened milk',                  price:  40, isVeg: true, cat: 'Beverages', dailyLimit:  80, calories: 145 },
  { name: 'Rose Milk',        description: 'Chilled sweet rose-flavored milk',                     price:  35, isVeg: true, cat: 'Beverages', dailyLimit:  90, calories: 120 },
  { name: 'Soft Drinks',      description: 'Chilled packaged cola or soda',                        price:  40, isVeg: true, cat: 'Beverages', dailyLimit: 150, calories: 140 },
  { name: 'Mineral Water',    description: 'Packaged drinking water 500 ml',                       price:  20, isVeg: true, cat: 'Beverages', dailyLimit: 500, calories:   0 },

  // ── Dinner → mapped to Lunch window ───────────────────────────────────────
  { name: 'Veg Noodles',                description: 'Stir-fried noodles with seasonal vegetables',           price:  80, isVeg: true,  cat: 'Dinner', dailyLimit:  90, calories: 380 },
  { name: 'Chicken Noodles',            description: 'Wok-tossed noodles with chicken strips',                price: 110, isVeg: false, cat: 'Dinner', dailyLimit:  80, calories: 460, isSpicy: true, spiceLevel: 1 },
  { name: 'Egg Fried Rice',             description: 'Fluffy rice with scrambled eggs',                       price: 100, isVeg: false, cat: 'Dinner', dailyLimit:  80, calories: 440 },
  { name: 'Paneer Fried Rice',          description: 'Fragrant rice with golden paneer cubes',                price: 110, isVeg: true,  cat: 'Dinner', dailyLimit:  70, calories: 490 },
  { name: 'Parotta',                    description: 'Flaky layered flatbread (2 pcs) with onion raita',      price:  40, isVeg: true,  cat: 'Dinner', dailyLimit: 150, calories: 280 },
  { name: 'Parotta with Chicken Curry', description: 'Layered parotta with rich spicy chicken gravy',         price: 120, isVeg: false, cat: 'Dinner', dailyLimit: 100, calories: 620, isSpicy: true, spiceLevel: 2, isBestseller: true },

  // ── Combo Meals ────────────────────────────────────────────────────────────
  { name: 'Veg Combo Meal',     description: 'Rice, veg curry & cold drink',       price: 120, isVeg: true,  cat: 'Combo Meals', dailyLimit:  80, calories: 700, swOverride: ['Lunch'],                  isBestseller: true },
  { name: 'Chicken Combo Meal', description: 'Chicken curry, rice & cold drink',   price: 150, isVeg: false, cat: 'Combo Meals', dailyLimit:  60, calories: 820, swOverride: ['Lunch'],                  isBestseller: true, isSpicy: true, spiceLevel: 2 },
  { name: 'Mini Snack Combo',   description: 'Samosa (2 pcs) with masala tea',     price:  35, isVeg: true,  cat: 'Combo Meals', dailyLimit: 120, calories: 200, swOverride: ['Evening Snacks / Tea'],   isBestseller: true },
  { name: 'Breakfast Combo',    description: 'Idli, vada & filter coffee',         price:  60, isVeg: true,  cat: 'Combo Meals', dailyLimit: 100, calories: 380, swOverride: ['Breakfast'],              isBestseller: true },

  // ── Desserts ───────────────────────────────────────────────────────────────
  { name: 'Gulab Jamun',   description: 'Soft milk-solid dumplings in rose syrup (2 pcs)', price: 40, isVeg: true, cat: 'Desserts', dailyLimit: 100, calories: 260, isBestseller: true  },
  { name: 'Kesari',        description: 'Saffron semolina sweet garnished with cashews',   price: 35, isVeg: true, cat: 'Desserts', dailyLimit:  80, calories: 220 },
  { name: 'Ice Cream Cup', description: 'Single-scoop vanilla or chocolate ice cream',     price: 50, isVeg: true, cat: 'Desserts', dailyLimit: 120, calories: 180 },

  // ── Healthy / Salads ───────────────────────────────────────────────────────
  { name: 'Fruit Salad',   description: 'Mixed fresh seasonal fruits with honey dressing', price: 60, isVeg: true,  cat: 'Healthy', dailyLimit:  70, calories: 130, isNew: true  },
  { name: 'Sprouts Salad', description: 'Protein-rich sprouted legumes with lemon',        price: 50, isVeg: true,  cat: 'Healthy', dailyLimit:  60, calories: 110, isNew: true  },
  { name: 'Boiled Eggs',   description: 'Plain boiled eggs (2 pcs) with pepper & salt',   price: 30, isVeg: false, cat: 'Healthy', dailyLimit: 100, calories: 140 },
  { name: 'Paneer Salad',  description: 'Fresh paneer cubes with crunchy vegetables',      price: 90, isVeg: true,  cat: 'Healthy', dailyLimit:  50, calories: 220, isNew: true  },
];

// ── Build documents ───────────────────────────────────────────────────────────
function buildDocuments(startCount) {
  return RAW.map((item, idx) => {
    const cat = CATEGORIES[item.cat];
    if (!cat) throw new Error(`Unknown category: ${item.cat}`);

    const serviceWindow = item.swOverride || cat.wins;
    if (!serviceWindow) throw new Error(`No service window for: ${item.name}`);

    return {
      itemCode:       `ITEM${String(startCount + idx + 1).padStart(4, '0')}`,
      franchiseId:    new mongoose.Types.ObjectId(FRANCHISE_ID),
      branchId:       new mongoose.Types.ObjectId(BRANCH_ID),
      categoryId:     new mongoose.Types.ObjectId(cat.id),
      name:           item.name,
      description:    item.description,
      price:          item.price,
      tax:            item.tax ?? 0,
      images:         imgs(item.name),
      tags:           item.isVeg ? ['Veg'] : ['Non-Veg'],
      isVeg:          item.isVeg,
      isAvailable:    true,
      isGlobal:       false,
      isDeleted:      false,
      isBestseller:   item.isBestseller  || false,
      isNew:          item.isNew         || false,
      isSpicy:        item.isSpicy       || false,
      spiceLevel:     item.spiceLevel    || 0,
      calories:       item.calories      ?? null,
      serviceWindow,
      dailyLimit:     item.dailyLimit    || 0,
      preparationTime: item.prepTime     || 10,
      displayOrder:   idx,
    };
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const mongoUri = 'mongodb+srv://aravinthr465_db_user:fE69zGvRmEwVzddG@cluster0.vomef1e.mongodb.net/cafeteria_db';
  if (!mongoUri) {
    console.error('ERROR: No MongoDB URI found in .env (MONGO_URI / MONGODB_URI)');
    process.exit(1);
  }

  console.log('Connecting to MongoDB…');
  await mongoose.connect(mongoUri);
  console.log('Connected.\n');

  const clearFlag = process.argv.includes('--clear');

  if (clearFlag) {
    const { deletedCount } = await MenuItem.deleteMany({
      franchiseId: FRANCHISE_ID,
      branchId: BRANCH_ID,
    });
    console.log(`Cleared ${deletedCount} existing items for this branch.`);
  }

  const existing = await MenuItem.find({
    franchiseId: FRANCHISE_ID,
    branchId: BRANCH_ID,
    isDeleted: false,
  }).select('name');

  const existingNames = new Set(existing.map(e => e.name.toLowerCase()));
  const startCount = await MenuItem.countDocuments({});

  const docs = buildDocuments(startCount);
  const toInsert = docs.filter(d => !existingNames.has(d.name.toLowerCase()));
  const skipped  = docs.length - toInsert.length;

  if (toInsert.length === 0) {
    console.log('All items already exist. Nothing to insert.');
    console.log('Tip: run with --clear to wipe and re-seed.');
    await mongoose.disconnect();
    return;
  }

  const result = await MenuItem.insertMany(toInsert, { ordered: false });

  console.log(`\n✓ Inserted : ${result.length} items`);
  if (skipped > 0) console.log(`  Skipped  : ${skipped} (already exist)`);

  console.log('\nService window breakdown:');
  const byWindow = {};
  toInsert.forEach(d => {
    d.serviceWindow.forEach(w => { byWindow[w] = (byWindow[w] || 0) + 1; });
  });
  Object.entries(byWindow).forEach(([w, count]) => {
    console.log(`  ${w.padEnd(28)} ${count} items`);
  });

  console.log('\nCategory breakdown:');
  const grouped = {};
  toInsert.forEach(d => {
    const catKey = d.categoryId.toString();
    grouped[catKey] = (grouped[catKey] || 0) + 1;
  });
  const catNameById = Object.fromEntries(
    Object.entries(CATEGORIES).map(([name, c]) => [c.id, name])
  );
  Object.entries(grouped).forEach(([id, count]) => {
    console.log(`  ${(catNameById[id] || id).padEnd(18)} ${count} items`);
  });

  await mongoose.disconnect();
  console.log('\nDone.');
}

main().catch(err => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
