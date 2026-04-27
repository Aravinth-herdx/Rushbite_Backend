const bcrypt = require('bcryptjs');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const { success, error, unauthorized } = require('../utils/apiResponse');

// POST /auth/login
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return error(res, 'Email and password are required', 400);
    }

    const user = await User.findOne({ email: email.toLowerCase(), isActive: true, isDeleted: false }).select(
      '+password +permissions'
    );

    if (!user) {
      return unauthorized(res, 'Invalid email or password');
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return unauthorized(res, 'Invalid email or password');
    }

    const payload = { id: user._id, role: user.role, franchiseId: user.franchiseId, branchId: user.branchId };
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    // Store refresh token hash
    const hash = await bcrypt.hash(refreshToken, 8);
    await User.findByIdAndUpdate(user._id, {
      refreshTokenHash: hash,
      lastLogin: new Date(),
      $inc: { loginCount: 1 },
    });

    // Audit log
    await AuditLog.create({
      action: 'LOGIN',
      resource: 'user',
      resourceId: user._id,
      resourceName: user.email,
      userId: user._id,
      userName: user.name,
      userRole: user.role,
      franchiseId: user.franchiseId || null,
      branchId: user.branchId || null,
      ip: req.ip || '',
      userAgent: req.get('user-agent') || '',
    });

    const userData = user.toObject();
    delete userData.password;
    delete userData.refreshTokenHash;

    return success(res, { user: userData, accessToken, refreshToken }, 'Login successful');
  } catch (err) {
    console.error('Login error:', err);
    return error(res, 'Login failed', 500);
  }
};

// POST /auth/login/otp
// If the phone number exists → send OTP to existing user.
// If not → auto-create a new customer account and send OTP (register + login in one step).
const loginOTP = async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return error(res, 'Phone number is required', 400);

    // Normalize: strip non-digit chars for uniqueness check, keep original for storage
    const digitsOnly = phone.replace(/[^0-9]/g, '');
    if (digitsOnly.length < 10) return error(res, 'Invalid phone number', 400);

    let user = await User.findOne({ phone, isActive: true, isDeleted: false });
    let isNewUser = false;

    if (!user) {
      // Auto-register: create a new customer account.
      // Email field is required by schema — use a unique placeholder.
      const placeholderEmail = `mobile_${digitsOnly}@cafeflow.app`;
      // Mobile OTP users are treated as employees (order-placing staff)
      user = await User.create({
        name: 'CafeFlow User',
        email: placeholderEmail,
        phone,
        role: 'employee',
        isActive: true,
        permissions: {
          viewOrders: true, updateOrderStatus: false, cancelOrder: false,
          manageMenu: false, viewReports: false, manageInventory: false,
          manageUsers: false, manageRoles: false, manageSettings: false,
          processWalkin: false, validateToken: false, processPayment: false,
          viewAuditTrail: false, manageFranchise: false, manageBranch: false,
          managePromotions: false, viewFeedback: false, sendNotifications: false,
          manageNotifications: false, viewDashboard: true,
        },
      });
      isNewUser = true;
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await User.findByIdAndUpdate(user._id, { otp, otpExpiry });

    // In production, integrate SMS gateway here (Twilio, MSG91, etc.)
    console.log(`[OTP] ${phone}: ${otp}${isNewUser ? ' (new user created)' : ''}`);

    return success(res, { phone, isNewUser }, 'OTP sent successfully');
  } catch (err) {
    console.error('OTP send error:', err);
    return error(res, 'Failed to send OTP', 500);
  }
};

// POST /auth/verify-otp
const verifyOTP = async (req, res) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) return error(res, 'Phone and OTP are required', 400);

    const user = await User.findOne({ phone, isActive: true, isDeleted: false }).select(
      '+otp +otpExpiry +permissions'
    );

    if (!user) return error(res, 'User not found', 404);
    if (!user.otp || !user.otpExpiry) return error(res, 'No OTP requested', 400);
    if (new Date() > user.otpExpiry) return error(res, 'OTP expired', 400);
    if (user.otp !== otp) return unauthorized(res, 'Invalid OTP');

    // Clear OTP
    await User.findByIdAndUpdate(user._id, {
      otp: null,
      otpExpiry: null,
      lastLogin: new Date(),
      $inc: { loginCount: 1 },
    });

    const payload = { id: user._id, role: user.role, franchiseId: user.franchiseId, branchId: user.branchId };
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);
    const hash = await bcrypt.hash(refreshToken, 8);
    await User.findByIdAndUpdate(user._id, { refreshTokenHash: hash });

    const userData = user.toObject();
    delete userData.otp;
    delete userData.otpExpiry;
    delete userData.refreshTokenHash;

    return success(res, { user: userData, accessToken, refreshToken }, 'OTP verified successfully');
  } catch (err) {
    console.error('OTP verify error:', err);
    return error(res, 'OTP verification failed', 500);
  }
};

// POST /auth/refresh
const refreshToken = async (req, res) => {
  try {
    const { refreshToken: token } = req.body;
    if (!token) return error(res, 'Refresh token is required', 400);

    let decoded;
    try {
      decoded = verifyRefreshToken(token);
    } catch (e) {
      return unauthorized(res, 'Invalid or expired refresh token');
    }

    const user = await User.findOne({ _id: decoded.id, isActive: true, isDeleted: false }).select(
      '+refreshTokenHash +permissions'
    );

    if (!user || !user.refreshTokenHash) {
      return unauthorized(res, 'Invalid session');
    }

    const isValid = await bcrypt.compare(token, user.refreshTokenHash);
    if (!isValid) return unauthorized(res, 'Invalid refresh token');

    const payload = { id: user._id, role: user.role, franchiseId: user.franchiseId, branchId: user.branchId };
    const newAccessToken = generateAccessToken(payload);
    const newRefreshToken = generateRefreshToken(payload);
    const hash = await bcrypt.hash(newRefreshToken, 8);
    await User.findByIdAndUpdate(user._id, { refreshTokenHash: hash });

    return success(res, { accessToken: newAccessToken, refreshToken: newRefreshToken }, 'Token refreshed');
  } catch (err) {
    console.error('Refresh error:', err);
    return error(res, 'Token refresh failed', 500);
  }
};

// POST /auth/logout
const logout = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { refreshTokenHash: null });

    await AuditLog.create({
      action: 'LOGOUT',
      resource: 'user',
      resourceId: req.user._id,
      resourceName: req.user.email,
      userId: req.user._id,
      userName: req.user.name,
      userRole: req.user.role,
      franchiseId: req.user.franchiseId || null,
      ip: req.ip || '',
    });

    return success(res, null, 'Logged out successfully');
  } catch (err) {
    console.error('Logout error:', err);
    return error(res, 'Logout failed', 500);
  }
};

// GET /auth/me
const me = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-password -refreshTokenHash -otp -otpExpiry')
      .populate('franchiseId', 'name code')
      .populate('branchId', 'name code');

    if (!user) return error(res, 'User not found', 404);
    return success(res, user, 'Profile fetched');
  } catch (err) {
    console.error('Me error:', err);
    return error(res, 'Failed to fetch profile', 500);
  }
};

// POST /auth/change-password
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return error(res, 'Current and new passwords are required', 400);
    }
    if (newPassword.length < 6) {
      return error(res, 'New password must be at least 6 characters', 400);
    }

    const user = await User.findById(req.user._id).select('+password');
    if (!user) return error(res, 'User not found', 404);

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) return error(res, 'Current password is incorrect', 400);

    user.password = newPassword;
    await user.save();

    return success(res, null, 'Password changed successfully');
  } catch (err) {
    console.error('Change password error:', err);
    return error(res, 'Failed to change password', 500);
  }
};

// POST /auth/forgot-password
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return error(res, 'Email is required', 400);

    const user = await User.findOne({ email: email.toLowerCase(), isActive: true, isDeleted: false });
    if (!user) {
      // Security: don't reveal if user exists
      return success(res, null, 'If an account exists, OTP has been sent');
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 min
    await User.findByIdAndUpdate(user._id, { otp, otpExpiry });

    // Send email (use existing email utility if available, else log)
    try {
      const { sendEmail } = require('../utils/email');
      await sendEmail({
        to: user.email,
        subject: 'Password Reset OTP - MyRevealer Cafeteria',
        html: `<p>Hi ${user.name},</p><p>Your password reset OTP is: <strong>${otp}</strong></p><p>Valid for 15 minutes.</p>`,
      });
    } catch (emailErr) {
      console.log(`[FORGOT PASSWORD] OTP for ${email}: ${otp}`);
    }

    return success(res, null, 'If an account exists, OTP has been sent');
  } catch (err) {
    console.error('Forgot password error:', err);
    return error(res, 'Failed to process request', 500);
  }
};

// POST /auth/reset-password
const resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
      return error(res, 'Email, OTP, and new password are required', 400);
    }
    if (newPassword.length < 6) {
      return error(res, 'Password must be at least 6 characters', 400);
    }

    const user = await User.findOne({ email: email.toLowerCase(), isActive: true, isDeleted: false })
      .select('+otp +otpExpiry');
    if (!user) return error(res, 'Invalid request', 400);
    if (!user.otp || !user.otpExpiry) return error(res, 'No OTP requested', 400);
    if (new Date() > user.otpExpiry) return error(res, 'OTP expired. Please request a new one.', 400);
    if (user.otp !== otp) return error(res, 'Invalid OTP', 400);

    user.password = newPassword;
    user.otp = null;
    user.otpExpiry = null;
    await user.save();

    return success(res, null, 'Password reset successfully');
  } catch (err) {
    console.error('Reset password error:', err);
    return error(res, 'Failed to reset password', 500);
  }
};

// POST /auth/login/phone
// Direct phone login — no OTP required.
// Used during development / before SMS purchase.
// OTP flow (loginOTP + verifyOTP) is preserved and can be re-enabled at any time.
const loginWithPhone = async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return error(res, 'Phone number is required', 400);

    const digitsOnly = phone.replace(/[^0-9]/g, '');
    if (digitsOnly.length < 10) return error(res, 'Invalid phone number', 400);

    let user = await User.findOne({ phone, isActive: true, isDeleted: false }).select('+permissions');

    if (!user) {
      const placeholderEmail = `mobile_${digitsOnly}@cafeflow.app`;
      user = await User.create({
        name: 'CafeFlow User',
        email: placeholderEmail,
        phone,
        role: 'employee',
        isActive: true,
        permissions: {
          viewOrders: true, updateOrderStatus: false, cancelOrder: false,
          manageMenu: false, viewReports: false, manageInventory: false,
          manageUsers: false, manageRoles: false, manageSettings: false,
          processWalkin: false, validateToken: false, processPayment: false,
          viewAuditTrail: false, manageFranchise: false, manageBranch: false,
          managePromotions: false, viewFeedback: false, sendNotifications: false,
          manageNotifications: false, viewDashboard: true,
        },
      });
    }

    const { appVersion, deviceInfo } = req.body;

    await User.findByIdAndUpdate(user._id, {
      lastLogin: new Date(),
      lastOpened: new Date(),
      ...(appVersion && { appVersion }),
      ...(deviceInfo && { deviceInfo }),
      $inc: { loginCount: 1 },
    });

    const payload = { id: user._id, role: user.role, franchiseId: user.franchiseId, branchId: user.branchId };
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);
    const hash = await bcrypt.hash(refreshToken, 8);
    await User.findByIdAndUpdate(user._id, { refreshTokenHash: hash });

    const userData = user.toObject();
    delete userData.password;
    delete userData.refreshTokenHash;
    delete userData.otp;
    delete userData.otpExpiry;

    console.log(`[PHONE LOGIN] ${phone} — user ${user._id}`);
    return success(res, { user: userData, accessToken, refreshToken }, 'Login successful');
  } catch (err) {
    console.error('Phone login error:', err);
    return error(res, 'Login failed', 500);
  }
};

// POST /auth/device
// Called on every app open (if already authenticated) to keep device info + lastOpened fresh.
const updateDeviceInfo = async (req, res) => {
  try {
    const { appVersion, deviceInfo } = req.body;

    const update = { lastOpened: new Date() };
    if (appVersion) update.appVersion = appVersion;
    if (deviceInfo && typeof deviceInfo === 'object') update.deviceInfo = deviceInfo;

    await User.findByIdAndUpdate(req.user._id, update);
    return success(res, null, 'Device info updated');
  } catch (err) {
    console.error('Device info error:', err);
    return error(res, 'Failed to update device info', 500);
  }
};

// PUT /auth/profile  — update display name and/or phone for the logged-in user
const updateProfile = async (req, res) => {
  try {
    const { name, phone } = req.body;
    if (!name && !phone) {
      return error(res, 'Provide at least name or phone to update', 400);
    }

    const update = {};
    if (name && name.trim()) update.name = name.trim();
    if (phone && phone.trim()) update.phone = phone.trim();

    const user = await User.findByIdAndUpdate(
      req.user._id,
      update,
      { new: true, runValidators: true },
    ).select('-password -refreshTokenHash -otp -otpExpiry');

    if (!user) return error(res, 'User not found', 404);
    return success(res, user, 'Profile updated');
  } catch (err) {
    console.error('Update profile error:', err);
    return error(res, 'Failed to update profile', 500);
  }
};

module.exports = { login, loginOTP, verifyOTP, loginWithPhone, refreshToken, logout, me, changePassword, forgotPassword, resetPassword, updateProfile, updateDeviceInfo };
