// scripts/seed.js — Run: npm run seed
//
// Seeds the Horizon IT Cafeteria franchise with the HITEC City Branch.
// Fixed ObjectIds are used so the menuItems.seed.js references still work:
//   Franchise : 69c5feac62ec8cd3444de6c5
//   Branch    : 69c5feac62ec8cd3444de6e3
//
// Roles created (separate collection, isSystem: true):
//   system_admin | cafeteria_manager | kitchen_staff | counter_staff | employee | guest
//
// Users created (one per role + extras for kitchen & counter):
//   admin@cafeteria.com         / Password@123   → system_admin
//   manager@hitec.com           / Password@123   → cafeteria_manager
//   kitchen1@hitec.com          / Password@123   → kitchen_staff
//   kitchen2@hitec.com          / Password@123   → kitchen_staff
//   counter1@hitec.com          / Password@123   → counter_staff
//   counter2@hitec.com          / Password@123   → counter_staff
//   employee1@hitec.com         / Password@123   → employee
//   employee2@hitec.com         / Password@123   → employee
//   guest@hitec.com             / Password@123   → guest  (demo/test)

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const User       = require('../src/models/User');
const Role       = require('../src/models/Role');
const Franchise  = require('../src/models/Franchise');
const Branch     = require('../src/models/Branch');
const MenuItem   = require('../src/models/MenuItem');
const Order      = require('../src/models/Order');
const Inventory  = require('../src/models/Inventory');
const InventoryCategory = require('../src/models/InventoryCategory');
const StockMovement = require('../src/models/StockMovement');
const Promotion  = require('../src/models/Promotion');
const Notification = require('../src/models/Notification');
const AuditLog   = require('../src/models/AuditLog');

const MONGO_URI   = 'mongodb+srv://aravinthr465_db_user:fE69zGvRmEwVzddG@cluster0.vomef1e.mongodb.net/cafeteria_db';

// ─── Fixed IDs (must match menuItems.seed.js) ─────────────────────────────────
const FRANCHISE_ID = new mongoose.Types.ObjectId('69c5feac62ec8cd3444de6c5');
const BRANCH_ID    = new mongoose.Types.ObjectId('69c5feac62ec8cd3444de6e3');

// ─── Helpers ──────────────────────────────────────────────────────────────────
const hash = (pwd) => bcrypt.hash(pwd, 12);
const log  = (msg) => console.log(`  ✓ ${msg}`);
const sec  = (msg) => console.log(`\n📦 ${msg}`);

// ─── Role permission sets (match Role.js schema field names) ──────────────────
const ROLE_PERMISSIONS = {
  system_admin: {
    viewOrders: true, updateOrderStatus: true, cancelOrders: true,
    viewMenu: true, manageMenu: true, viewReports: true, exportReports: true,
    manageUsers: true, manageRoles: true, manageSettings: true,
    viewInventory: true, manageInventory: true, managePromotions: true,
    handleWalkin: true, validateTokens: true, viewAuditTrail: true,
    manageNotifications: true, manageAvailability: true,
    viewAnalytics: true, managePayments: true,
  },
  cafeteria_manager: {
    viewOrders: true, updateOrderStatus: true, cancelOrders: true,
    viewMenu: true, manageMenu: true, viewReports: true, exportReports: true,
    manageUsers: true, manageRoles: false, manageSettings: true,
    viewInventory: true, manageInventory: true, managePromotions: true,
    handleWalkin: true, validateTokens: true, viewAuditTrail: false,
    manageNotifications: true, manageAvailability: true,
    viewAnalytics: true, managePayments: true,
  },
  kitchen_staff: {
    viewOrders: true, updateOrderStatus: true, cancelOrders: false,
    viewMenu: true, manageMenu: false, viewReports: false, exportReports: false,
    manageUsers: false, manageRoles: false, manageSettings: false,
    viewInventory: true, manageInventory: false, managePromotions: false,
    handleWalkin: false, validateTokens: false, viewAuditTrail: false,
    manageNotifications: false, manageAvailability: true,
    viewAnalytics: false, managePayments: false,
  },
  counter_staff: {
    viewOrders: true, updateOrderStatus: true, cancelOrders: false,
    viewMenu: true, manageMenu: false, viewReports: false, exportReports: false,
    manageUsers: false, manageRoles: false, manageSettings: false,
    viewInventory: false, manageInventory: false, managePromotions: false,
    handleWalkin: true, validateTokens: true, viewAuditTrail: false,
    manageNotifications: false, manageAvailability: false,
    viewAnalytics: false, managePayments: true,
  },
  employee: {
    viewOrders: true, updateOrderStatus: false, cancelOrders: false,
    viewMenu: true, manageMenu: false, viewReports: false, exportReports: false,
    manageUsers: false, manageRoles: false, manageSettings: false,
    viewInventory: false, manageInventory: false, managePromotions: false,
    handleWalkin: false, validateTokens: false, viewAuditTrail: false,
    manageNotifications: false, manageAvailability: false,
    viewAnalytics: false, managePayments: false,
  },
  guest: {
    viewOrders: false, updateOrderStatus: false, cancelOrders: false,
    viewMenu: true, manageMenu: false, viewReports: false, exportReports: false,
    manageUsers: false, manageRoles: false, manageSettings: false,
    viewInventory: false, manageInventory: false, managePromotions: false,
    handleWalkin: false, validateTokens: false, viewAuditTrail: false,
    manageNotifications: false, manageAvailability: false,
    viewAnalytics: false, managePayments: false,
  },
};

// User.permissions uses the User-model schema field names.
// They differ from Role.permissions — map them here once.
const USER_PERMISSIONS = {
  system_admin: {
    viewOrders: true, updateOrderStatus: true, cancelOrder: true,
    manageMenu: true, viewReports: true, manageInventory: true,
    manageUsers: true, manageRoles: true, manageSettings: true,
    processWalkin: true, validateToken: true, processPayment: true,
    viewAuditTrail: true, manageFranchise: true, manageBranch: true,
    managePromotions: true, viewFeedback: true, sendNotifications: true,
    manageNotifications: true, viewDashboard: true,
  },
  cafeteria_manager: {
    viewOrders: true, updateOrderStatus: true, cancelOrder: true,
    manageMenu: true, viewReports: true, manageInventory: true,
    manageUsers: true, manageRoles: false, manageSettings: true,
    processWalkin: true, validateToken: true, processPayment: true,
    viewAuditTrail: false, manageFranchise: false, manageBranch: true,
    managePromotions: true, viewFeedback: true, sendNotifications: true,
    manageNotifications: true, viewDashboard: true,
  },
  kitchen_staff: {
    viewOrders: true, updateOrderStatus: true, cancelOrder: false,
    manageMenu: false, viewReports: false, manageInventory: false,
    manageUsers: false, manageRoles: false, manageSettings: false,
    processWalkin: false, validateToken: false, processPayment: false,
    viewAuditTrail: false, manageFranchise: false, manageBranch: false,
    managePromotions: false, viewFeedback: false, sendNotifications: false,
    manageNotifications: false, viewDashboard: true,
  },
  counter_staff: {
    viewOrders: true, updateOrderStatus: true, cancelOrder: false,
    manageMenu: false, viewReports: false, manageInventory: false,
    manageUsers: false, manageRoles: false, manageSettings: false,
    processWalkin: true, validateToken: true, processPayment: true,
    viewAuditTrail: false, manageFranchise: false, manageBranch: false,
    managePromotions: false, viewFeedback: false, sendNotifications: false,
    manageNotifications: false, viewDashboard: true,
  },
  employee: {
    viewOrders: true, updateOrderStatus: false, cancelOrder: false,
    manageMenu: false, viewReports: false, manageInventory: false,
    manageUsers: false, manageRoles: false, manageSettings: false,
    processWalkin: false, validateToken: false, processPayment: false,
    viewAuditTrail: false, manageFranchise: false, manageBranch: false,
    managePromotions: false, viewFeedback: false, sendNotifications: false,
    manageNotifications: false, viewDashboard: true,
  },
  guest: {
    viewOrders: false, updateOrderStatus: false, cancelOrder: false,
    manageMenu: false, viewReports: false, manageInventory: false,
    manageUsers: false, manageRoles: false, manageSettings: false,
    processWalkin: false, validateToken: false, processPayment: false,
    viewAuditTrail: false, manageFranchise: false, manageBranch: false,
    managePromotions: false, viewFeedback: false, sendNotifications: false,
    manageNotifications: false, viewDashboard: false,
  },
};

// ─── Main Seed ────────────────────────────────────────────────────────────────

async function seed() {
  console.log('\n🌱 Cafeteria DB Seed — HITEC City Branch');
  console.log('━'.repeat(50));

  await mongoose.connect(MONGO_URI);
  console.log(`\n✅ Connected: ${MONGO_URI}`);

  // ── Clean all collections ──────────────────────────────────────────────────
  sec('Clearing all collections...');
  await Promise.all([
    User.deleteMany({}),
    Role.deleteMany({}),
    Franchise.deleteMany({}),
    Branch.deleteMany({}),
    MenuItem.deleteMany({}),
    Order.deleteMany({}),
    Inventory.deleteMany({}),
    InventoryCategory.deleteMany({}),
    StockMovement.deleteMany({}),
    Promotion.deleteMany({}),
    Notification.deleteMany({}),
    AuditLog.deleteMany({}),
  ]);
  log('All collections cleared');

  // ── ROLES ─────────────────────────────────────────────────────────────────
  sec('Seeding Roles...');

  const roles = await Role.insertMany([
    {
      name: 'system_admin',
      displayName: 'System Administrator',
      description: 'Full access to all system features',
      isSystem: true,
      color: '#7C3AED',
      permissions: ROLE_PERMISSIONS.system_admin,
    },
    {
      name: 'cafeteria_manager',
      displayName: 'Cafeteria Manager',
      description: 'Manages day-to-day cafeteria operations',
      isSystem: true,
      color: '#1A56DB',
      permissions: ROLE_PERMISSIONS.cafeteria_manager,
    },
    {
      name: 'kitchen_staff',
      displayName: 'Kitchen Staff',
      description: 'Handles food preparation and kitchen queue',
      isSystem: true,
      color: '#D97706',
      permissions: ROLE_PERMISSIONS.kitchen_staff,
    },
    {
      name: 'counter_staff',
      displayName: 'Counter Staff',
      description: 'Handles customer orders and walk-ins at the counter',
      isSystem: true,
      color: '#0E9F6E',
      permissions: ROLE_PERMISSIONS.counter_staff,
    },
    {
      name: 'employee',
      displayName: 'Employee',
      description: 'General employee — browse menu and place orders via mobile app',
      isSystem: true,
      color: '#6B7280',
      permissions: ROLE_PERMISSIONS.employee,
    },
    {
      name: 'guest',
      displayName: 'Guest',
      description: 'Walk-in web guest — browse menu and place orders via QR scan',
      isSystem: true,
      color: '#9CA3AF',
      permissions: ROLE_PERMISSIONS.guest,
    },
  ]);
  log(`${roles.length} roles created`);

  // ── FRANCHISE ─────────────────────────────────────────────────────────────
  sec('Seeding Franchise...');

  const franchise = await Franchise.create({
    _id: FRANCHISE_ID,
    name: 'Horizon IT Cafeteria',
    code: 'HIC',
    ownerName: 'Venkatesh Narayanan',
    email: 'info@horizonitcafe.com',
    phone: '8012345678',
    address: '78, Whitefield Main Road',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560066',
    gstin: '29AABCH9012F1Z9',
    isActive: true,
    stats: { totalBranches: 1, activeBranches: 1, totalOrders: 0, monthlyRevenue: 0 },
  });
  log(`Franchise created: ${franchise.name} (${franchise._id})`);

  // ── BRANCH ────────────────────────────────────────────────────────────────
  sec('Seeding Branch...');

  const branch = await Branch.create({
    _id: BRANCH_ID,
    franchiseId: FRANCHISE_ID,
    name: 'HITEC City Branch',
    code: 'HCB',
    address: 'Cyber Towers, HITEC City',
    city: 'Hyderabad',
    state: 'Telangana',
    phone: '8012345680',
    email: 'hitec@horizonitcafe.com',
    managerName: 'Ramesh Babu',
    isActive: true,
    serviceWindows: [
      { name: 'Breakfast',           startTime: '07:00', endTime: '10:00', isActive: true },
      { name: 'Lunch',               startTime: '12:30', endTime: '15:00', isActive: true },
      { name: 'Evening Snacks / Tea', startTime: '16:00', endTime: '18:00', isActive: true },
    ],
    workingDays: {
      monday: true, tuesday: true, wednesday: true,
      thursday: true, friday: true, saturday: true, sunday: false,
    },
    workingHours: { openTime: '07:00', closeTime: '22:00' },
    stats: { totalOrders: 0, pendingOrders: 0, todayRevenue: 0 },
  });
  log(`Branch created: ${branch.name} (${branch._id})`);

  // ── USERS ─────────────────────────────────────────────────────────────────
  sec('Seeding Users...');

  const PWD = await hash('Password@123');

  // Helper to build a user document
  const mkUser = (overrides) => ({
    isActive: true,
    franchiseId: FRANCHISE_ID,
    branchId:    BRANCH_ID,
    password:    PWD,
    ...overrides,
  });

  const users = await User.insertMany([
    // ── System Admin (no branch scope) ──────────────────────────────────────
    mkUser({
      employeeId:  'HCB20260001',
      name:        'Aravinth R',
      email:       'admin@cafeteria.com',
      phone:       '9800000001',
      role:        'system_admin',
      department:  'Administration',
      franchiseId: null,
      branchId:    null,
      permissions: USER_PERMISSIONS.system_admin,
    }),

    // ── Cafeteria Manager ───────────────────────────────────────────────────
    mkUser({
      employeeId:  'HCB20260002',
      name:        'Ramesh Babu',
      email:       'manager@hitec.com',
      phone:       '9800000002',
      role:        'cafeteria_manager',
      department:  'Operations',
      permissions: USER_PERMISSIONS.cafeteria_manager,
    }),

    // ── Kitchen Staff ───────────────────────────────────────────────────────
    mkUser({
      employeeId:  'HCB20260003',
      name:        'Muthu Vel',
      email:       'kitchen1@hitec.com',
      phone:       '9800000003',
      role:        'kitchen_staff',
      department:  'Kitchen',
      permissions: USER_PERMISSIONS.kitchen_staff,
    }),
    mkUser({
      employeeId:  'HCB20260004',
      name:        'Suresh Babu',
      email:       'kitchen2@hitec.com',
      phone:       '9800000004',
      role:        'kitchen_staff',
      department:  'Kitchen',
      permissions: USER_PERMISSIONS.kitchen_staff,
    }),

    // ── Counter Staff ────────────────────────────────────────────────────────
    mkUser({
      employeeId:  'HCB20260005',
      name:        'Anitha Devi',
      email:       'counter1@hitec.com',
      phone:       '9800000005',
      role:        'counter_staff',
      department:  'Counter',
      permissions: USER_PERMISSIONS.counter_staff,
    }),
    mkUser({
      employeeId:  'HCB20260006',
      name:        'Ravi Krishnan',
      email:       'counter2@hitec.com',
      phone:       '9800000006',
      role:        'counter_staff',
      department:  'Counter',
      permissions: USER_PERMISSIONS.counter_staff,
    }),

    // ── Employee (mobile app order placers) ─────────────────────────────────
    mkUser({
      employeeId:  'HCB20260007',
      name:        'Priya Sharma',
      email:       'employee1@hitec.com',
      phone:       '9800000007',
      role:        'employee',
      department:  'Engineering',
      permissions: USER_PERMISSIONS.employee,
    }),
    mkUser({
      employeeId:  'HCB20260008',
      name:        'Kiran Reddy',
      email:       'employee2@hitec.com',
      phone:       '9800000008',
      role:        'employee',
      department:  'Design',
      permissions: USER_PERMISSIONS.employee,
    }),

    // ── Guest (web QR-scan demo) ─────────────────────────────────────────────
    mkUser({
      employeeId:  'HCB20260009',
      name:        'Walk-In Guest',
      email:       'guest@hitec.com',
      phone:       '9800000009',
      role:        'guest',
      department:  '',
      permissions: USER_PERMISSIONS.guest,
    }),
  ]);

  log(`${users.length} users created`);
  console.log('\n  Credentials (all passwords: Password@123)');
  console.log('  ─────────────────────────────────────────────────────────');
  const roleLabel = { system_admin: 'System Admin    ', cafeteria_manager: 'Manager         ', kitchen_staff: 'Kitchen Staff   ', counter_staff: 'Counter Staff   ', employee: 'Employee        ', guest: 'Guest           ' };
  users.forEach((u) => console.log(`  ${(roleLabel[u.role] || u.role.padEnd(16))} ${u.email}`));

  // ── Disconnect ─────────────────────────────────────────────────────────────
  await mongoose.disconnect();
  console.log('\n✅ Seed complete.\n');
}

seed().catch((err) => {
  console.error('\n❌ Seed failed:', err.message);
  process.exit(1);
});
