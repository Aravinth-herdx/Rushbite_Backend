const { verifyAccessToken } = require('../utils/jwt');
const User = require('../models/User');
const { unauthorized } = require('../utils/apiResponse');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return unauthorized(res, 'No token provided');
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return unauthorized(res, 'No token provided');
    }

    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return unauthorized(res, 'Token expired');
      }
      return unauthorized(res, 'Invalid token');
    }

    const user = await User.findOne({
      _id: decoded.id,
      isActive: true,
      isDeleted: false,
    }).select('+permissions');

    if (!user) {
      return unauthorized(res, 'User not found or inactive');
    }

    req.user = user;
    next();
  } catch (err) {
    return unauthorized(res, 'Authentication failed');
  }
};

module.exports = authenticate;
