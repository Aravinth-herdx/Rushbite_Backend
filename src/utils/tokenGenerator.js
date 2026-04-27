const Order = require('../models/Order');

/**
 * Generate order token: {BranchCode}-{WindowInitial}-{DailyCounter}
 * e.g. "MCF-L-042"
 */
const generateOrderToken = async (branchCode, serviceWindow) => {
  const windowInitials = {
    Breakfast: 'B',
    Lunch: 'L',
    Snacks: 'S',
    Dinner: 'D',
  };

  const initial = windowInitials[serviceWindow] || 'O';
  const branchPart = (branchCode || 'XX').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);

  // Count today's orders for this branch+window to get daily counter
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const todayCount = await Order.countDocuments({
    tokenNumber: new RegExp(`^${branchPart}-${initial}-`, 'i'),
    createdAt: { $gte: startOfDay },
  });

  const counter = String(todayCount + 1).padStart(3, '0');
  return `${branchPart}-${initial}-${counter}`;
};

/**
 * Generate employee ID: EMP{year}{4digits}
 * e.g. "EMP20240001"
 */
const generateEmployeeId = async (User) => {
  const year = new Date().getFullYear();
  const count = await User.countDocuments({});
  const padded = String(count + 1).padStart(4, '0');
  return `EMP${year}${padded}`;
};

module.exports = { generateOrderToken, generateEmployeeId };
