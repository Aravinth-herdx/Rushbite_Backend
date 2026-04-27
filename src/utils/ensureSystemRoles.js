// src/utils/ensureSystemRoles.js
// Run once on server start — upserts any missing system roles so the live
// database stays in sync with code without requiring a full reseed.
//
// Permission field names match the Role model schema (role_models.dart / Role.js):
//   viewOrders, updateOrderStatus, cancelOrders, viewMenu, manageMenu,
//   viewReports, exportReports, manageUsers, manageRoles, manageSettings,
//   viewInventory, manageInventory, managePromotions, handleWalkin,
//   validateTokens, viewAuditTrail, manageNotifications, manageAvailability,
//   viewAnalytics, managePayments

const Role = require('../models/Role');

const SYSTEM_ROLES = [
  // ── System Administrator ───────────────────────────────────────────────────
  {
    name: 'system_admin',
    displayName: 'System Administrator',
    description: 'Full access to all system features',
    isSystem: true,
    color: '#7C3AED',
    permissions: {
      viewOrders: true, updateOrderStatus: true, cancelOrders: true,
      viewMenu: true, manageMenu: true, viewReports: true, exportReports: true,
      manageUsers: true, manageRoles: true, manageSettings: true,
      viewInventory: true, manageInventory: true, managePromotions: true,
      handleWalkin: true, validateTokens: true, viewAuditTrail: true,
      manageNotifications: true, manageAvailability: true,
      viewAnalytics: true, managePayments: true,
    },
  },

  // ── Cafeteria Manager ──────────────────────────────────────────────────────
  {
    name: 'cafeteria_manager',
    displayName: 'Cafeteria Manager',
    description: 'Manages day-to-day cafeteria operations',
    isSystem: true,
    color: '#1A56DB',
    permissions: {
      viewOrders: true, updateOrderStatus: true, cancelOrders: true,
      viewMenu: true, manageMenu: true, viewReports: true, exportReports: true,
      manageUsers: true, manageRoles: false, manageSettings: true,
      viewInventory: true, manageInventory: true, managePromotions: true,
      handleWalkin: true, validateTokens: true, viewAuditTrail: false,
      manageNotifications: true, manageAvailability: true,
      viewAnalytics: true, managePayments: true,
    },
  },

  // ── Kitchen Staff ──────────────────────────────────────────────────────────
  {
    name: 'kitchen_staff',
    displayName: 'Kitchen Staff',
    description: 'Handles food preparation and kitchen queue',
    isSystem: true,
    color: '#D97706',
    permissions: {
      viewOrders: true, updateOrderStatus: true, cancelOrders: false,
      viewMenu: true, manageMenu: false, viewReports: false, exportReports: false,
      manageUsers: false, manageRoles: false, manageSettings: false,
      viewInventory: true, manageInventory: false, managePromotions: false,
      handleWalkin: false, validateTokens: false, viewAuditTrail: false,
      manageNotifications: false, manageAvailability: true,
      viewAnalytics: false, managePayments: false,
    },
  },

  // ── Counter Staff ──────────────────────────────────────────────────────────
  {
    name: 'counter_staff',
    displayName: 'Counter Staff',
    description: 'Handles customer orders and walk-ins at the counter',
    isSystem: true,
    color: '#0E9F6E',
    permissions: {
      viewOrders: true, updateOrderStatus: true, cancelOrders: false,
      viewMenu: true, manageMenu: false, viewReports: false, exportReports: false,
      manageUsers: false, manageRoles: false, manageSettings: false,
      viewInventory: false, manageInventory: false, managePromotions: false,
      handleWalkin: true, validateTokens: true, viewAuditTrail: false,
      manageNotifications: false, manageAvailability: false,
      viewAnalytics: false, managePayments: true,
    },
  },

  // ── Employee (mobile app users who place orders) ───────────────────────────
  {
    name: 'employee',
    displayName: 'Employee',
    description: 'General employee — browse menu and place orders via mobile app',
    isSystem: true,
    color: '#6B7280',
    permissions: {
      viewOrders: true, updateOrderStatus: false, cancelOrders: false,
      viewMenu: true, manageMenu: false, viewReports: false, exportReports: false,
      manageUsers: false, manageRoles: false, manageSettings: false,
      viewInventory: false, manageInventory: false, managePromotions: false,
      handleWalkin: false, validateTokens: false, viewAuditTrail: false,
      manageNotifications: false, manageAvailability: false,
      viewAnalytics: false, managePayments: false,
    },
  },

  // ── Guest (web QR-scan users) ──────────────────────────────────────────────
  {
    name: 'guest',
    displayName: 'Guest',
    description: 'Walk-in web guest — browse menu and place orders via QR scan',
    isSystem: true,
    color: '#9CA3AF',
    permissions: {
      viewOrders: false, updateOrderStatus: false, cancelOrders: false,
      viewMenu: true, manageMenu: false, viewReports: false, exportReports: false,
      manageUsers: false, manageRoles: false, manageSettings: false,
      viewInventory: false, manageInventory: false, managePromotions: false,
      handleWalkin: false, validateTokens: false, viewAuditTrail: false,
      manageNotifications: false, manageAvailability: false,
      viewAnalytics: false, managePayments: false,
    },
  },
];

const ensureSystemRoles = async () => {
  try {
    for (const role of SYSTEM_ROLES) {
      await Role.updateOne(
        { name: role.name },
        {
          $set: {
            displayName: role.displayName,
            description: role.description,
            color: role.color,
            permissions: role.permissions,
            isSystem: true,
          },
        },
        { upsert: true }
      );
    }
    console.log(`✅ System roles verified (${SYSTEM_ROLES.length} roles)`);
  } catch (err) {
    console.error('⚠️  ensureSystemRoles failed:', err.message);
  }
};

module.exports = ensureSystemRoles;
