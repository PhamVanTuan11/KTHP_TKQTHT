const path = require('path');
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const helmet = require('helmet');
const bcrypt = require('bcryptjs');

const db = require('./db');
const logger = require('./logger');
const model = require('./models/restaurantModel');
const {
  VALID_CATEGORIES,
  VALID_TABLE_STATUSES,
  VALID_ORDER_STATUSES,
  VALID_PAYMENT_METHODS,
  validateMenuItemInput,
  validateTableInput,
  validateOrderInput
} = require('./validation');
const {
  globalLimiter,
  loginLimiter,
  attachCsrfToken,
  verifyCsrfToken,
  requireAuth
} = require('./middleware/security');

const app = express();
const PORT = Number(process.env.APP_PORT || 3000);

app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"]
      }
    }
  })
);

app.use(express.urlencoded({ extended: false, limit: '256kb' }));
app.use(express.json({ limit: '256kb' }));
app.use('/public', express.static(path.join(__dirname, '..', 'public')));

app.use(globalLimiter);

// Request structured logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    if (req.path.startsWith('/public')) return;
    logger.info('http_request', `${req.method} ${req.originalUrl}`, {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      duration_ms: Date.now() - start,
      ip: req.ip,
      user: req.session && req.session.user ? req.session.user.username : 'anonymous'
    });
  });
  next();
});

// Healthcheck endpoint (accessible without session)
app.get('/health', async (req, res) => {
  try {
    const info = await model.getHealthStatus();
    return res.status(200).json({
      status: 'UP',
      service: 'restaurant-order-app',
      database: 'CONNECTED',
      db_name: info.db_name,
      db_user: info.db_user,
      counts: {
        menu_items: info.menu_count,
        dining_tables: info.table_count,
        orders: info.order_count
      },
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    logger.error('healthcheck_failed', 'Database healthcheck failed', { error: err.message });
    return res.status(503).json({
      status: 'DOWN',
      service: 'restaurant-order-app',
      database: 'DISCONNECTED',
      error: err.message
    });
  }
});

app.use(
  session({
    store: new pgSession({
      pool: db.pool,
      tableName: 'session',
      pruneSessionInterval: 60 * 15
    }),
    name: 'ro_session_id',
    secret: process.env.SESSION_SECRET || 'dev_fallback_secret_change_in_env_file_123456',
    resave: false,
    saveUninitialized: true,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000
    }
  })
);

app.use(attachCsrfToken);
app.use(verifyCsrfToken);

// Helper for currency formatting in EJS
app.locals.formatVND = (amount) => {
  const num = Number(amount || 0);
  return num.toLocaleString('vi-VN') + ' ₫';
};

// ============================================================================
// AUTHENTICATION ROUTES
// ============================================================================
app.get('/login', (req, res) => {
  if (req.session && req.session.user) {
    return res.redirect('/');
  }
  res.render('login', {
    title: 'Đăng nhập Quản trị Nhà hàng / Order',
    error: null,
    redirect: req.query.redirect || '/'
  });
});

app.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    const redirectUrl = String(req.body.redirect || '/');

    const user = await model.findUserByUsername(username);
    const valid = user ? await bcrypt.compare(password, user.password_hash) : false;

    if (!user || !valid) {
      logger.warn('login_failed', 'Authentication failed for user', {
        username: username || 'unknown',
        status: 401,
        ip: req.ip
      });
      await model.recordAudit({
        username: username || 'unknown',
        action: 'LOGIN_FAILED',
        entity_type: 'auth',
        entity_id: username || 'unknown',
        details: `Đăng nhập thất bại vào hệ thống Quản lý Nhà hàng / Order`,
        ip_address: req.ip
      });
      return res.status(401).render('login', {
        title: 'Đăng nhập Quản trị Nhà hàng / Order',
        error: 'Tên đăng nhập hoặc mật khẩu không chính xác.',
        redirect: redirectUrl
      });
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      email: user.email,
      role: user.role
    };

    logger.info('login_success', 'User authenticated successfully', {
      username: user.username,
      role: user.role,
      ip: req.ip
    });

    await model.recordAudit({
      username: user.username,
      action: 'LOGIN_SUCCESS',
      entity_type: 'auth',
      entity_id: String(user.id),
      details: `Đăng nhập thành công (${user.full_name} - ${user.role})`,
      ip_address: req.ip
    });

    const safeRedirect = redirectUrl.startsWith('/') && !redirectUrl.startsWith('//') ? redirectUrl : '/';
    return res.redirect(safeRedirect);
  } catch (err) {
    next(err);
  }
});

app.post('/logout', requireAuth, async (req, res, next) => {
  try {
    const username = req.session.user.username;
    await model.recordAudit({
      username,
      action: 'LOGOUT',
      entity_type: 'auth',
      entity_id: username,
      details: 'Đăng xuất khỏi hệ thống quản trị',
      ip_address: req.ip
    });
    req.session.destroy(() => {
      res.clearCookie('ro_session_id');
      res.redirect('/login');
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// DASHBOARD ROUTE
// ============================================================================
app.get('/', async (req, res, next) => {
  try {
    const data = await model.getDashboardStats();
    res.render('dashboard', {
      title: 'Tổng quan Quản lý Nhà hàng / Order',
      activeNav: 'dashboard',
      stats: data.stats,
      recentOrders: data.recentOrders,
      tables: data.tables
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// MENU ITEMS (QUẢN LÝ MÓN ĂN / THỰC ĐƠN)
// ============================================================================
app.get('/menu', requireAuth, async (req, res, next) => {
  try {
    const q = String(req.query.q || '');
    const category = String(req.query.category || '');
    const availability = String(req.query.availability || '');
    const items = await model.listMenuItems({ q, category, availability });
    res.render('menu', {
      title: 'Quản lý Thực đơn & Món ăn',
      activeNav: 'menu',
      items,
      categories: VALID_CATEGORIES,
      filters: { q, category, availability },
      flash: req.query.msg || null,
      error: req.query.err || null
    });
  } catch (err) {
    next(err);
  }
});

app.post('/menu', requireAuth, async (req, res, next) => {
  try {
    const check = validateMenuItemInput(req.body);
    if (!check.valid) {
      return res.status(400).redirect(`/menu?err=${encodeURIComponent(check.errors.join(' '))}`);
    }
    const created = await model.createMenuItem(check.cleaned);
    logger.info('menu_created', 'Created new menu item', {
      code: created.code,
      name: created.name,
      price: created.price,
      user: req.session.user.username
    });
    await model.recordAudit({
      username: req.session.user.username,
      action: 'CREATE_MENU_ITEM',
      entity_type: 'menu_items',
      entity_id: created.code,
      details: `Thêm món ăn mới: ${created.code} - ${created.name} (${Number(created.price).toLocaleString('vi-VN')} VNĐ)`,
      ip_address: req.ip
    });
    res.redirect(`/menu?msg=${encodeURIComponent(`Đã thêm món ${created.code} - ${created.name}`)}`);
  } catch (err) {
    if (err.code === '23505') {
      return res.redirect(`/menu?err=${encodeURIComponent('Mã món ăn đã tồn tại trong thực đơn.')}`);
    }
    next(err);
  }
});

app.post('/menu/:id/toggle', requireAuth, async (req, res, next) => {
  try {
    const updated = await model.toggleMenuItemAvailability(Number(req.params.id));
    if (updated) {
      await model.recordAudit({
        username: req.session.user.username,
        action: 'UPDATE_MENU_ITEM',
        entity_type: 'menu_items',
        entity_id: updated.code,
        details: `Cập nhật trạng thái phục vụ món ${updated.code}: ${updated.is_available ? 'Còn món' : 'Tạm hết'}`,
        ip_address: req.ip
      });
    }
    res.redirect('/menu?msg=' + encodeURIComponent('Đã cập nhật trạng thái món ăn.'));
  } catch (err) {
    next(err);
  }
});

app.post('/menu/:id/delete', requireAuth, async (req, res, next) => {
  try {
    const deleted = await model.deleteMenuItem(Number(req.params.id));
    if (deleted) {
      logger.info('menu_deleted', 'Deleted menu item', {
        code: deleted.code,
        user: req.session.user.username
      });
      await model.recordAudit({
        username: req.session.user.username,
        action: 'DELETE_MENU_ITEM',
        entity_type: 'menu_items',
        entity_id: deleted.code,
        details: `Xóa món ăn ${deleted.code} - ${deleted.name} khỏi thực đơn`,
        ip_address: req.ip
      });
    }
    res.redirect('/menu?msg=' + encodeURIComponent('Đã xóa món ăn thành công.'));
  } catch (err) {
    return res.redirect('/menu?err=' + encodeURIComponent('Không thể xóa món ăn đang gắn với đơn hàng.'));
  }
});

// ============================================================================
// ORDERS (QUẢN LÝ ĐƠN HÀNG / ORDER)
// ============================================================================
app.get('/orders', requireAuth, async (req, res, next) => {
  try {
    const q = String(req.query.q || '');
    const status = String(req.query.status || '');
    const table_id = String(req.query.table_id || '');
    const [orders, tables, menuItems] = await Promise.all([
      model.listOrders({ q, status, table_id }),
      model.listTables(),
      model.listMenuItems({ availability: 'available' })
    ]);
    res.render('orders', {
      title: 'Quản lý Đơn hàng / Order',
      activeNav: 'orders',
      orders,
      tables,
      menuItems,
      orderStatuses: VALID_ORDER_STATUSES,
      paymentMethods: VALID_PAYMENT_METHODS,
      filters: { q, status, table_id },
      flash: req.query.msg || null,
      error: req.query.err || null
    });
  } catch (err) {
    next(err);
  }
});

app.post('/orders', requireAuth, async (req, res, next) => {
  try {
    const check = validateOrderInput(req.body);
    if (!check.valid) {
      return res.status(400).redirect(`/orders?err=${encodeURIComponent(check.errors.join(' '))}`);
    }
    const created = await model.createOrder({
      ...check.cleaned,
      created_by: req.session.user.username,
      initial_menu_item_id: req.body.initial_menu_item_id,
      initial_quantity: req.body.initial_quantity
    });

    logger.info('order_created', 'Created new restaurant order', {
      order_code: created.order_code,
      table_id: created.table_id,
      total_amount: created.total_amount,
      user: req.session.user.username
    });

    await model.recordAudit({
      username: req.session.user.username,
      action: 'CREATE_ORDER',
      entity_type: 'orders',
      entity_id: created.order_code,
      details: `Tạo đơn hàng ${created.order_code} cho khách ${created.customer_name} tại bàn ${created.table_code} (${Number(created.total_amount).toLocaleString('vi-VN')} VNĐ)`,
      ip_address: req.ip
    });

    res.redirect(`/orders/${created.id}?msg=${encodeURIComponent(`Đã tạo đơn hàng ${created.order_code}`)}`);
  } catch (err) {
    if (err.code === '23505') {
      return res.redirect(`/orders?err=${encodeURIComponent('Mã đơn hàng đã tồn tại.')}`);
    }
    next(err);
  }
});

app.get('/orders/:id', requireAuth, async (req, res, next) => {
  try {
    const detail = await model.getOrderWithItems(Number(req.params.id));
    if (!detail) {
      return res.status(404).render('error', {
        title: '404 Not Found - Không tìm thấy đơn hàng',
        statusCode: 404,
        message: 'Đơn hàng yêu cầu không tồn tại hoặc đã bị xóa.'
      });
    }
    const menuItems = await model.listMenuItems({ availability: 'available' });
    res.render('order_detail', {
      title: `Chi tiết Đơn hàng ${detail.order.order_code}`,
      activeNav: 'orders',
      order: detail.order,
      items: detail.items,
      menuItems,
      orderStatuses: VALID_ORDER_STATUSES,
      paymentMethods: VALID_PAYMENT_METHODS,
      flash: req.query.msg || null,
      error: req.query.err || null
    });
  } catch (err) {
    next(err);
  }
});

app.post('/orders/:id/status', requireAuth, async (req, res, next) => {
  try {
    const orderId = Number(req.params.id);
    const status = String(req.body.status || '').trim();
    const payment_method = req.body.payment_method ? String(req.body.payment_method).trim() : null;

    if (!VALID_ORDER_STATUSES.includes(status)) {
      return res.redirect(`/orders/${orderId}?err=${encodeURIComponent('Trạng thái đơn hàng không hợp lệ.')}`);
    }

    const updated = await model.updateOrderStatus(orderId, status, payment_method);
    if (updated) {
      logger.info('order_status_updated', 'Updated order status', {
        order_code: updated.order_code,
        status: updated.status,
        user: req.session.user.username
      });
      await model.recordAudit({
        username: req.session.user.username,
        action: 'UPDATE_ORDER_STATUS',
        entity_type: 'orders',
        entity_id: updated.order_code,
        details: `Cập nhật trạng thái đơn hàng ${updated.order_code} sang ${updated.status}`,
        ip_address: req.ip
      });
    }
    const backTo = req.body.return_to === 'list' ? '/orders' : `/orders/${orderId}`;
    res.redirect(`${backTo}?msg=${encodeURIComponent('Đã cập nhật trạng thái đơn hàng.')}`);
  } catch (err) {
    next(err);
  }
});

app.post('/orders/:id/items', requireAuth, async (req, res, next) => {
  try {
    const orderId = Number(req.params.id);
    const updatedOrder = await model.addOrderItem(orderId, {
      menu_item_id: req.body.menu_item_id,
      quantity: req.body.quantity,
      item_status: req.body.item_status || 'Queued',
      note: req.body.note || ''
    });

    await model.recordAudit({
      username: req.session.user.username,
      action: 'ADD_ORDER_ITEM',
      entity_type: 'order_items',
      entity_id: updatedOrder ? updatedOrder.order_code : String(orderId),
      details: `Thêm món vào đơn hàng #${orderId} (Tổng mới: ${Number(updatedOrder ? updatedOrder.total_amount : 0).toLocaleString('vi-VN')} VNĐ)`,
      ip_address: req.ip
    });

    res.redirect(`/orders/${orderId}?msg=${encodeURIComponent('Đã thêm món vào đơn hàng.')}`);
  } catch (err) {
    next(err);
  }
});

app.post('/orders/:id/items/:itemId/status', requireAuth, async (req, res, next) => {
  try {
    const orderId = Number(req.params.id);
    const itemId = Number(req.params.itemId);
    const itemStatus = String(req.body.item_status || 'Served').trim();
    if (['Queued', 'Cooking', 'Served'].includes(itemStatus)) {
      await model.updateOrderItemStatus(itemId, itemStatus);
    }
    res.redirect(`/orders/${orderId}?msg=${encodeURIComponent('Đã cập nhật trạng thái chế biến món.')}`);
  } catch (err) {
    next(err);
  }
});

app.post('/orders/:id/items/:itemId/delete', requireAuth, async (req, res, next) => {
  try {
    const orderId = Number(req.params.id);
    const itemId = Number(req.params.itemId);
    await model.deleteOrderItem(orderId, itemId);
    res.redirect(`/orders/${orderId}?msg=${encodeURIComponent('Đã xóa món khỏi đơn hàng.')}`);
  } catch (err) {
    next(err);
  }
});

app.post('/orders/:id/delete', requireAuth, async (req, res, next) => {
  try {
    const deleted = await model.deleteOrder(Number(req.params.id));
    if (deleted) {
      logger.info('order_deleted', 'Deleted restaurant order', {
        order_code: deleted.order_code,
        user: req.session.user.username
      });
      await model.recordAudit({
        username: req.session.user.username,
        action: 'DELETE_ORDER',
        entity_type: 'orders',
        entity_id: deleted.order_code,
        details: `Xóa đơn hàng ${deleted.order_code} (${deleted.customer_name})`,
        ip_address: req.ip
      });
    }
    res.redirect('/orders?msg=' + encodeURIComponent('Đã xóa đơn hàng thành công.'));
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// DINING TABLES (QUẢN LÝ BÀN ĂN & KHU VỰC)
// ============================================================================
app.get('/tables', requireAuth, async (req, res, next) => {
  try {
    const area = String(req.query.area || '');
    const status = String(req.query.status || '');
    const tables = await model.listTables({ area, status });
    res.render('tables', {
      title: 'Quản lý Bàn ăn & Khu vực',
      activeNav: 'tables',
      tables,
      tableStatuses: VALID_TABLE_STATUSES,
      filters: { area, status },
      flash: req.query.msg || null,
      error: req.query.err || null
    });
  } catch (err) {
    next(err);
  }
});

app.post('/tables', requireAuth, async (req, res, next) => {
  try {
    const check = validateTableInput(req.body);
    if (!check.valid) {
      return res.status(400).redirect(`/tables?err=${encodeURIComponent(check.errors.join(' '))}`);
    }
    const created = await model.createTable(check.cleaned);
    logger.info('table_created', 'Created new dining table', {
      table_code: created.table_code,
      table_name: created.table_name,
      user: req.session.user.username
    });
    await model.recordAudit({
      username: req.session.user.username,
      action: 'CREATE_TABLE',
      entity_type: 'dining_tables',
      entity_id: created.table_code,
      details: `Thêm bàn ăn mới: ${created.table_code} - ${created.table_name} (${created.area}, ${created.capacity} ghế)`,
      ip_address: req.ip
    });
    res.redirect(`/tables?msg=${encodeURIComponent(`Đã thêm bàn ${created.table_code}`)}`);
  } catch (err) {
    if (err.code === '23505') {
      return res.redirect(`/tables?err=${encodeURIComponent('Mã bàn ăn đã tồn tại.')}`);
    }
    next(err);
  }
});

app.post('/tables/:id/status', requireAuth, async (req, res, next) => {
  try {
    const tableId = Number(req.params.id);
    const status = String(req.body.status || 'Available').trim();
    if (VALID_TABLE_STATUSES.includes(status)) {
      const updated = await model.updateTableStatus(tableId, status);
      if (updated) {
        await model.recordAudit({
          username: req.session.user.username,
          action: 'UPDATE_TABLE_STATUS',
          entity_type: 'dining_tables',
          entity_id: updated.table_code,
          details: `Cập nhật trạng thái bàn ${updated.table_code} sang ${updated.status}`,
          ip_address: req.ip
        });
      }
    }
    res.redirect('/tables?msg=' + encodeURIComponent('Đã cập nhật trạng thái bàn ăn.'));
  } catch (err) {
    next(err);
  }
});

app.post('/tables/:id/delete', requireAuth, async (req, res, next) => {
  try {
    const deleted = await model.deleteTable(Number(req.params.id));
    if (deleted) {
      await model.recordAudit({
        username: req.session.user.username,
        action: 'DELETE_TABLE',
        entity_type: 'dining_tables',
        entity_id: deleted.table_code,
        details: `Xóa bàn ăn ${deleted.table_code} - ${deleted.table_name}`,
        ip_address: req.ip
      });
    }
    res.redirect('/tables?msg=' + encodeURIComponent('Đã xóa bàn ăn thành công.'));
  } catch (err) {
    return res.redirect('/tables?err=' + encodeURIComponent('Không thể xóa bàn đang có đơn hàng liên kết.'));
  }
});

// ============================================================================
// AUDIT LOGS
// ============================================================================
app.get('/audit', requireAuth, async (req, res, next) => {
  try {
    const logs = await model.listAuditLogs(60);
    res.render('audit', {
      title: 'Nhật ký Kiểm toán & Hoạt động (Audit Logs)',
      activeNav: 'audit',
      logs
    });
  } catch (err) {
    next(err);
  }
});

// 404 Handler
app.use((req, res) => {
  logger.warn('route_not_found', `Route not found: ${req.method} ${req.originalUrl}`, {
    method: req.method,
    path: req.originalUrl,
    status: 404,
    ip: req.ip
  });
  res.status(404).render('error', {
    title: '404 Not Found - Trang không tồn tại',
    statusCode: 404,
    message: `Đường dẫn "${req.originalUrl}" không tồn tại trên hệ thống Quản lý Nhà hàng / Order.`
  });
});

// Global Error Handler
app.use((err, req, res, _next) => {
  logger.error('unhandled_error', err.message, {
    method: req.method,
    path: req.originalUrl,
    status: 500
  });
  res.status(500).render('error', {
    title: '500 Internal Server Error',
    statusCode: 500,
    message: 'Đã xảy ra lỗi xử lý trên máy chủ. Vui lòng kiểm tra nhật ký hệ thống.'
  });
});

if (require.main === module) {
  db.ensureAdminAccount().finally(() => {
    app.listen(PORT, '0.0.0.0', () => {
      logger.info('server_started', `Restaurant Order Management server listening on port ${PORT}`, {
        port: PORT,
        env: process.env.NODE_ENV || 'production'
      });
    });
  });
}

module.exports = app;
