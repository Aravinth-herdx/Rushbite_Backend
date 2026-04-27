const Order = require('../models/Order');
const MenuItem = require('../models/MenuItem');
const User = require('../models/User');
const { success, error } = require('../utils/apiResponse');

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // UTC+5:30

// Returns midnight IST today as a UTC Date object
function getISTDayStart() {
  const nowIST = new Date(Date.now() + IST_OFFSET_MS);
  const yyyymmdd = nowIST.toISOString().slice(0, 10);
  return new Date(`${yyyymmdd}T00:00:00+05:30`);
}

const getBaseFilter = (req) => {
  const filter = { isDeleted: false };
  if (req.user.role !== 'system_admin' && req.user.franchiseId) {
    filter.franchiseId = req.user.franchiseId;
  }
  // Branch-level staff (kitchen, counter) should only see their own branch
  if (req.user.branchId && req.user.role !== 'system_admin' && req.user.role !== 'cafeteria_manager') {
    filter.branchId = req.user.branchId;
  }
  if (req.query.franchiseId) filter.franchiseId = req.query.franchiseId;
  if (req.query.branchId) filter.branchId = req.query.branchId;
  return filter;
};

// GET /reports/sales
const getSalesReport = async (req, res) => {
  try {
    const { dateFrom, dateTo, serviceWindow } = req.query;
    const filter = getBaseFilter(req);
    filter.status = { $nin: ['cancelled'] };

    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    } else {
      // Default: last 30 days
      filter.createdAt = { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };
    }

    if (serviceWindow) filter.serviceWindow = serviceWindow;

    const [summary, byWindow, byPaymentMode] = await Promise.all([
      Order.aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            totalRevenue: { $sum: '$totalAmount' },
            totalDiscount: { $sum: '$discount' },
            totalTax: { $sum: '$taxAmount' },
            avgOrderValue: { $avg: '$totalAmount' },
          },
        },
      ]),
      Order.aggregate([
        { $match: filter },
        {
          $group: {
            _id: '$serviceWindow',
            orders: { $sum: 1 },
            revenue: { $sum: '$totalAmount' },
          },
        },
        { $sort: { revenue: -1 } },
      ]),
      Order.aggregate([
        { $match: filter },
        {
          $group: {
            _id: '$paymentMode',
            orders: { $sum: 1 },
            revenue: { $sum: '$totalAmount' },
          },
        },
        { $sort: { revenue: -1 } },
      ]),
    ]);

    return success(res, {
      summary: summary[0] || { totalOrders: 0, totalRevenue: 0, totalDiscount: 0, totalTax: 0, avgOrderValue: 0 },
      byWindow,
      byPaymentMode,
    });
  } catch (err) {
    console.error('Sales report error:', err);
    return error(res, 'Failed to generate sales report', 500);
  }
};

// GET /reports/orders
const getOrderReport = async (req, res) => {
  try {
    const filter = getBaseFilter(req);
    if (req.query.dateFrom || req.query.dateTo) {
      filter.createdAt = {};
      if (req.query.dateFrom) filter.createdAt.$gte = new Date(req.query.dateFrom);
      if (req.query.dateTo) {
        const end = new Date(req.query.dateTo);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    } else {
      filter.createdAt = { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };
    }

    const byStatus = await Order.aggregate([
      { $match: filter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    const byDate = await Order.aggregate([
      { $match: filter },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          orders: { $sum: 1 },
          revenue: { $sum: '$totalAmount' },
          cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return success(res, { byStatus, byDate });
  } catch (err) {
    console.error('Order report error:', err);
    return error(res, 'Failed to generate order report', 500);
  }
};

// GET /reports/top-items
const getTopItems = async (req, res) => {
  try {
    const filter = getBaseFilter(req);
    filter.status = { $nin: ['cancelled'] };
    if (req.query.dateFrom) filter.createdAt = { $gte: new Date(req.query.dateFrom) };

    const topItems = await Order.aggregate([
      { $match: filter },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.menuItemId',
          name: { $first: '$items.name' },
          totalQuantity: { $sum: '$items.quantity' },
          totalRevenue: { $sum: '$items.subtotal' },
          orderCount: { $sum: 1 },
        },
      },
      { $sort: { totalQuantity: -1 } },
      { $limit: parseInt(req.query.limit) || 10 },
    ]);

    return success(res, topItems);
  } catch (err) {
    console.error('Top items error:', err);
    return error(res, 'Failed to fetch top items', 500);
  }
};

// GET /reports/daily-revenue
const getDailyRevenue = async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const filter = getBaseFilter(req);
    filter.status = { $nin: ['cancelled'] };
    filter.createdAt = { $gte: new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000) };

    const daily = await Order.aggregate([
      { $match: filter },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          revenue: { $sum: '$totalAmount' },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return success(res, daily);
  } catch (err) {
    console.error('Daily revenue error:', err);
    return error(res, 'Failed to fetch daily revenue', 500);
  }
};

// GET /reports/staff
const getStaffReport = async (req, res) => {
  try {
    const filter = getBaseFilter(req);
    filter.status = 'served';
    if (req.query.dateFrom || req.query.dateTo) {
      filter.createdAt = {};
      if (req.query.dateFrom) filter.createdAt.$gte = new Date(req.query.dateFrom);
      if (req.query.dateTo) {
        const end = new Date(req.query.dateTo);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    } else {
      filter.createdAt = { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };
    }

    const staffReport = await Order.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$servedBy',
          ordersServed: { $sum: 1 },
          totalRevenue: { $sum: '$totalAmount' },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'staff',
        },
      },
      { $unwind: { path: '$staff', preserveNullAndEmpty: true } },
      {
        $project: {
          staffId: '$_id',
          staffName: '$staff.name',
          staffRole: '$staff.role',
          ordersServed: 1,
          totalRevenue: 1,
        },
      },
      { $sort: { ordersServed: -1 } },
    ]);

    return success(res, staffReport);
  } catch (err) {
    console.error('Staff report error:', err);
    return error(res, 'Failed to fetch staff report', 500);
  }
};

// GET /reports/overview
const getOverview = async (req, res) => {
  try {
    const { period = 'today' } = req.query;
    const filter = getBaseFilter(req);
    filter.status = { $nin: ['cancelled'] };

    // Set date range based on period — all times in IST
    const now = new Date();
    if (period === 'today') {
      filter.createdAt = { $gte: getISTDayStart() };
    } else if (period === 'week') {
      filter.createdAt = { $gte: new Date(now - 7 * 24 * 60 * 60 * 1000) };
    } else if (period === 'month') {
      filter.createdAt = { $gte: new Date(now - 30 * 24 * 60 * 60 * 1000) };
    }

    const cancelFilter = { ...getBaseFilter(req), status: 'cancelled' };
    if (filter.createdAt) cancelFilter.createdAt = filter.createdAt;

    const [summary, cancelledCount, weeklyRaw, hourlyRaw, byStatusRaw, categoryRaw] = await Promise.all([
      Order.aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            totalRevenue: { $sum: '$totalAmount' },
            avgOrderValue: { $avg: '$totalAmount' },
            servedOrders: { $sum: { $cond: [{ $eq: ['$status', 'served'] }, 1, 0] } },
            pendingOrders: { $sum: { $cond: [{ $in: ['$status', ['received', 'accepted', 'preparing', 'ready']] }, 1, 0] } },
            avgRating: { $avg: '$rating' },
          },
        },
      ]),
      Order.countDocuments(cancelFilter),
      Order.aggregate([
        {
          $match: {
            ...getBaseFilter(req),
            status: { $nin: ['cancelled'] },
            createdAt: { $gte: new Date(now - 7 * 24 * 60 * 60 * 1000) },
          },
        },
        {
          $group: {
            _id: { $dayOfWeek: '$createdAt' },
            revenue: { $sum: '$totalAmount' },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Order.aggregate([
        { $match: filter },
        {
          $group: {
            // Use IST timezone for hour extraction (UTC+5:30)
            _id: { $hour: { date: '$createdAt', timezone: 'Asia/Kolkata' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Order.aggregate([
        { $match: { ...getBaseFilter(req), isDeleted: false, createdAt: filter.createdAt || { $gte: new Date(now - 24 * 60 * 60 * 1000) } } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Order.aggregate([
        { $match: filter },
        { $unwind: '$items' },
        { $group: { _id: '$items.category', count: { $sum: '$items.quantity' } } },
        { $sort: { count: -1 } },
      ]),
    ]);

    // Map weekday revenues (1=Sun, 2=Mon, ... 7=Sat) → Mon-Sun
    const weeklyRevenue = [2, 3, 4, 5, 6, 7, 1].map((day) => {
      const found = weeklyRaw.find((r) => r._id === day);
      return found ? found.revenue : 0;
    });

    // Map hourly orders to labeled hours
    const hourlyOrders = {};
    for (let h = 7; h <= 20; h++) {
      const label = `${h}:00`;
      const found = hourlyRaw.find((r) => r._id === h);
      hourlyOrders[label] = found ? found.count : 0;
    }

    // Find peak hour
    const peakEntry = Object.entries(hourlyOrders).reduce((a, b) => (b[1] > a[1] ? b : a), ['--', 0]);

    const stats = summary[0] || { totalOrders: 0, totalRevenue: 0, avgOrderValue: 0, servedOrders: 0, pendingOrders: 0 };

    // Build status breakdown map
    const orderStatusBreakdown = {};
    byStatusRaw.forEach((s) => { orderStatusBreakdown[s._id] = s.count; });

    // Build category breakdown map
    const categoryBreakdown = {};
    categoryRaw.forEach((c) => { if (c._id) categoryBreakdown[c._id] = c.count; });

    return success(res, {
      totalOrders: stats.totalOrders || 0,
      totalRevenue: stats.totalRevenue || 0,
      avgOrderValue: stats.avgOrderValue || 0,
      servedOrders: stats.servedOrders || 0,
      cancelledOrders: cancelledCount,
      pendingOrders: stats.pendingOrders || 0,
      customerSatisfaction: stats.avgRating ? parseFloat(stats.avgRating.toFixed(1)) : 4.5,
      peakHour: peakEntry[0],
      serviceTime: '12 min',
      weeklyRevenue,
      hourlyOrders,
      orderStatusBreakdown,
      categoryBreakdown,
    });
  } catch (err) {
    console.error('Overview report error:', err);
    return error(res, 'Failed to generate overview', 500);
  }
};

// GET /reports/sales (paginated daily sales)
const getDailySalesReport = async (req, res) => {
  try {
    const { period = 'month', page = 1, limit = 25 } = req.query;
    const filter = getBaseFilter(req);
    const now = new Date();

    if (period === 'today') {
      const start = new Date(now); start.setHours(0, 0, 0, 0);
      filter.createdAt = { $gte: start };
    } else if (period === 'week') {
      filter.createdAt = { $gte: new Date(now - 7 * 24 * 60 * 60 * 1000) };
    } else {
      filter.createdAt = { $gte: new Date(now - 30 * 24 * 60 * 60 * 1000) };
    }

    const daily = await Order.aggregate([
      { $match: filter },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          orders: { $sum: 1 },
          revenue: { $sum: '$totalAmount' },
        },
      },
      { $sort: { _id: -1 } },
    ]);

    const total = daily.length;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    const paginated_data = daily.slice(skip, skip + limitNum).map((d) => ({
      date: d._id,
      revenue: d.revenue,
      orders: d.orders,
    }));

    return res.json({
      success: true,
      data: paginated_data,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum),
        hasNext: pageNum * limitNum < total,
        hasPrev: pageNum > 1,
      },
    });
  } catch (err) {
    console.error('Daily sales report error:', err);
    return error(res, 'Failed to generate daily sales report', 500);
  }
};

// GET /reports/items (paginated top items)
const getItemsReport = async (req, res) => {
  try {
    const { period = 'month', limit = 10, page = 1 } = req.query;
    const filter = getBaseFilter(req);
    filter.status = { $nin: ['cancelled'] };
    const now = new Date();

    if (period === 'today') {
      const start = new Date(now); start.setHours(0, 0, 0, 0);
      filter.createdAt = { $gte: start };
    } else if (period === 'week') {
      filter.createdAt = { $gte: new Date(now - 7 * 24 * 60 * 60 * 1000) };
    } else {
      filter.createdAt = { $gte: new Date(now - 30 * 24 * 60 * 60 * 1000) };
    }

    const items = await Order.aggregate([
      { $match: filter },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.menuItemId',
          name: { $first: '$items.name' },
          soldCount: { $sum: '$items.quantity' },
          revenue: { $sum: '$items.subtotal' },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: parseInt(limit) },
      {
        $lookup: {
          from: 'menuitems',
          localField: '_id',
          foreignField: '_id',
          as: 'menuItem',
        },
      },
      { $unwind: { path: '$menuItem', preserveNullAndEmpty: true } },
      {
        $project: {
          _id: 1,
          name: 1,
          soldCount: 1,
          revenue: 1,
          category: '$menuItem.category',
          isVeg: { $ifNull: ['$menuItem.isVeg', true] },
          price: { $ifNull: ['$menuItem.price', 0] },
          rating: { $ifNull: ['$menuItem.ratings.average', 0] },
          ratingCount: { $ifNull: ['$menuItem.ratings.count', 0] },
        },
      },
    ]);

    return res.json({
      success: true,
      data: items,
      pagination: { total: items.length, page: 1, limit: parseInt(limit), pages: 1, hasNext: false, hasPrev: false },
    });
  } catch (err) {
    console.error('Items report error:', err);
    return error(res, 'Failed to fetch items report', 500);
  }
};

// GET /reports/franchise-performance
const getFranchisePerformance = async (req, res) => {
  try {
    const Franchise = require('../models/Franchise');
    const User = require('../models/User');
    const now = new Date();
    const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
    const startOfWeek = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const filter = { isDeleted: false };
    if (req.user.role !== 'system_admin' && req.user.franchiseId) {
      filter._id = req.user.franchiseId;
    }

    const franchises = await Franchise.find(filter).limit(10);

    const results = await Promise.all(franchises.map(async (f) => {
      const baseF = { franchiseId: f._id, isDeleted: false };

      const [todayStats, weekStats, staffCount] = await Promise.all([
        Order.aggregate([
          { $match: { ...baseF, status: { $nin: ['cancelled'] }, createdAt: { $gte: startOfDay } } },
          { $group: { _id: null, revenue: { $sum: '$totalAmount' }, orders: { $sum: 1 }, avgRating: { $avg: '$rating' } } },
        ]),
        Order.aggregate([
          { $match: { ...baseF, status: { $nin: ['cancelled'] }, createdAt: { $gte: startOfWeek } } },
          { $group: { _id: null, revenue: { $sum: '$totalAmount' } } },
        ]),
        User.countDocuments({ franchiseId: f._id, isDeleted: false }),
      ]);

      const today = todayStats[0] || { revenue: 0, orders: 0, avgRating: 0 };
      const weekRev = weekStats[0]?.revenue || 0;
      const dailyAvg = weekRev / 7;
      const growthPct = dailyAvg > 0 ? parseFloat(((today.revenue - dailyAvg) / dailyAvg * 100).toFixed(1)) : 0;

      return {
        id: f._id.toString(),
        name: f.name,
        shortName: f.code || f.name.substring(0, 3).toUpperCase(),
        todayRevenue: today.revenue,
        todayOrders: today.orders,
        satisfaction: today.avgRating ? parseFloat(today.avgRating.toFixed(1)) : 4.5,
        growthPct,
        staffCount,
      };
    }));

    return success(res, results);
  } catch (err) {
    console.error('Franchise performance error:', err);
    return error(res, 'Failed to fetch franchise performance', 500);
  }
};

module.exports = { getSalesReport, getOrderReport, getTopItems, getDailyRevenue, getStaffReport, getOverview, getDailySalesReport, getItemsReport, getFranchisePerformance };
