const router = require('express').Router();
const authenticate = require('../middleware/auth');
const { login, loginOTP, verifyOTP, loginWithPhone, refreshToken, logout, me, changePassword, forgotPassword, resetPassword, updateProfile, updateDeviceInfo } = require('../controllers/auth.controller');

router.post('/login', login);
router.post('/login/phone', loginWithPhone); // direct phone login — OTP not required
router.post('/login/otp', loginOTP);         // OTP flow preserved, re-enable when SMS purchased
router.post('/verify-otp', verifyOTP);
router.post('/refresh', refreshToken);
router.post('/logout', authenticate, logout);
router.post('/device', authenticate, updateDeviceInfo);
router.get('/me', authenticate, me);
router.put('/profile', authenticate, updateProfile);
router.post('/change-password', authenticate, changePassword);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

module.exports = router;
