const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const logger = require('../logger');

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Quá nhiều yêu cầu từ địa chỉ IP này, vui lòng thử lại sau 15 phút.'
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Quá số lần thử đăng nhập cho phép (tối đa 10 lần / 15 phút).'
});

function attachCsrfToken(req, res, next) {
  if (req.session) {
    if (!req.session.csrfToken) {
      req.session.csrfToken = crypto.randomBytes(24).toString('hex');
    }
    res.locals.csrfToken = req.session.csrfToken;
    res.locals.currentUser = req.session.user || null;
  } else {
    res.locals.csrfToken = '';
    res.locals.currentUser = null;
  }

  res.locals.studentInfo = {
    name: process.env.STUDENT_NAME || 'Phạm Văn Tuân',
    id: process.env.STUDENT_ID || 'DTC245200485',
    className: process.env.STUDENT_CLASS || 'CNTT K23I',
    instructor: process.env.INSTRUCTOR_NAME || 'Lê Khánh Dương',
    topicCode: process.env.TOPIC_CODE || 'Đề 12',
    topicTitle: process.env.TOPIC_TITLE || 'Hệ thống Quản lý Nhà hàng / Order'
  };

  next();
}

function verifyCsrfToken(req, res, next) {
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    const token = (req.body && req.body._csrf) || req.headers['x-csrf-token'];
    const sessionToken = req.session && req.session.csrfToken;

    if (!token || !sessionToken || token !== sessionToken) {
      logger.warn('csrf_rejected', 'Rejected request due to invalid or missing CSRF token', {
        method: req.method,
        path: req.originalUrl,
        status: 403,
        ip: req.ip
      });
      return res.status(403).render('error', {
        title: '403 Forbidden - Từ chối truy cập',
        statusCode: 403,
        message: 'Yêu cầu bị từ chối do thiếu hoặc sai mã bảo mật CSRF token.'
      });
    }
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    const redirectTarget = encodeURIComponent(req.originalUrl || '/');
    return res.redirect(`/login?redirect=${redirectTarget}`);
  }
  next();
}

module.exports = {
  globalLimiter,
  loginLimiter,
  attachCsrfToken,
  verifyCsrfToken,
  requireAuth
};
