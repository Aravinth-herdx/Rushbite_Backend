module.exports = {
  ROLES: {
    SYSTEM_ADMIN: 'system_admin',
    CAFETERIA_MANAGER: 'cafeteria_manager',
    KITCHEN_STAFF: 'kitchen_staff',
    COUNTER_STAFF: 'counter_staff',
    CUSTOMER: 'customer',        // Mobile app users (OTP login)
    GUEST: 'guest',              // Web-only users (no account, scan QR → browser)
  },

  ORDER_STATUSES: {
    RECEIVED: 'received',
    ACCEPTED: 'accepted',
    PREPARING: 'preparing',
    READY: 'ready',
    SERVED: 'served',
    CANCELLED: 'cancelled',
  },

  PAYMENT_MODES: {
    CASH: 'cash',
    UPI: 'upi',
    CARD: 'card',
    WALLET: 'wallet',
    COMPANY: 'company',
  },

  PAYMENT_STATUSES: {
    PENDING: 'pending',
    PAID: 'paid',
    REFUNDED: 'refunded',
  },

  MENU_CATEGORIES: [
    'Breakfast',
    'South Indian',
    'North Indian',
    'Rice & Curry',
    'Snacks',
    'Beverages',
    'Desserts',
    'Specials',
  ],

  SERVICE_WINDOWS: {
    BREAKFAST: 'Breakfast',
    LUNCH: 'Lunch',
    SNACKS: 'Snacks',
    DINNER: 'Dinner',
  },

  SERVICE_WINDOW_TIMES: {
    Breakfast: { start: '07:30', end: '10:30' },
    Lunch: { start: '12:00', end: '15:00' },
    Snacks: { start: '16:00', end: '18:00' },
    Dinner: { start: '19:00', end: '21:00' },
  },

  NOTIFICATION_TYPES: {
    INFO: 'info',
    WARNING: 'warning',
    ERROR: 'error',
    SUCCESS: 'success',
    ORDER: 'order',
    INVENTORY: 'inventory',
    SYSTEM: 'system',
  },

  FEEDBACK_CATEGORIES: [
    'food_quality',
    'service',
    'cleanliness',
    'value',
    'overall',
  ],

  AUDIT_ACTIONS: {
    CREATE: 'CREATE',
    UPDATE: 'UPDATE',
    DELETE: 'DELETE',
    LOGIN: 'LOGIN',
    LOGOUT: 'LOGOUT',
    STATUS_CHANGE: 'STATUS_CHANGE',
    RESTOCK: 'RESTOCK',
    TOGGLE: 'TOGGLE',
  },

  PERMISSIONS: {
    VIEW_ORDERS: 'viewOrders',
    UPDATE_ORDER_STATUS: 'updateOrderStatus',
    CANCEL_ORDER: 'cancelOrder',
    MANAGE_MENU: 'manageMenu',
    VIEW_REPORTS: 'viewReports',
    MANAGE_INVENTORY: 'manageInventory',
    MANAGE_USERS: 'manageUsers',
    MANAGE_ROLES: 'manageRoles',
    MANAGE_SETTINGS: 'manageSettings',
    PROCESS_WALKIN: 'processWalkin',
    VALIDATE_TOKEN: 'validateToken',
    PROCESS_PAYMENT: 'processPayment',
    VIEW_AUDIT_TRAIL: 'viewAuditTrail',
    MANAGE_FRANCHISE: 'manageFranchise',
    MANAGE_BRANCH: 'manageBranch',
    MANAGE_PROMOTIONS: 'managePromotions',
    VIEW_FEEDBACK: 'viewFeedback',
    SEND_NOTIFICATIONS: 'sendNotifications',
    MANAGE_NOTIFICATIONS: 'manageNotifications',
    VIEW_DASHBOARD: 'viewDashboard',
  },

  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,

  GST_RATE: 5.0,
  CURRENCY: 'INR',
  CURRENCY_SYMBOL: '₹',
};
