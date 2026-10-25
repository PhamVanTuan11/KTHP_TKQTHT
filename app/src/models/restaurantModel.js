const db = require('../db');
const { calculateOrderTotal } = require('../validation');

async function getHealthStatus() {
  const res = await db.query(`
    SELECT
      current_database() AS db_name,
      current_user AS db_user,
      (SELECT count(*)::int FROM menu_items) AS menu_count,
      (SELECT count(*)::int FROM dining_tables) AS table_count,
      (SELECT count(*)::int FROM orders) AS order_count
  `);
  return res.rows[0];
}

async function getDashboardStats() {
  const summaryRes = await db.query(`
    SELECT
      (SELECT count(*)::int FROM menu_items) AS total_menu_items,
      (SELECT count(*)::int FROM menu_items WHERE is_available = TRUE) AS available_menu_items,
      (SELECT count(*)::int FROM dining_tables) AS total_tables,
      (SELECT count(*)::int FROM dining_tables WHERE status = 'Occupied') AS occupied_tables,
      (SELECT count(*)::int FROM orders) AS total_orders,
      (SELECT count(*)::int FROM orders WHERE status IN ('Pending', 'Preparing', 'Served')) AS active_orders,
      (SELECT COALESCE(SUM(total_amount), 0)::bigint FROM orders WHERE status IN ('Served', 'Paid')) AS total_revenue
  `);

  const recentOrdersRes = await db.query(`
    SELECT
      o.id, o.order_code, o.customer_name, o.guest_count, o.status,
      o.payment_method, o.total_amount, o.created_by, o.created_at,
      t.table_code, t.table_name, t.area,
      (SELECT count(*)::int FROM order_items oi WHERE oi.order_id = o.id) AS item_count,
      (SELECT count(*)::int FROM order_items oi WHERE oi.order_id = o.id AND oi.item_status = 'Served') AS served_item_count
    FROM orders o
    JOIN dining_tables t ON t.id = o.table_id
    ORDER BY o.id DESC
    LIMIT 6
  `);

  const tablesRes = await db.query(`
    SELECT id, table_code, table_name, area, capacity, status, note
    FROM dining_tables
    ORDER BY table_code ASC
  `);

  return {
    stats: summaryRes.rows[0],
    recentOrders: recentOrdersRes.rows,
    tables: tablesRes.rows
  };
}

// ============================================================================
// MENU ITEMS (MÓN ĂN / THỰC ĐƠN)
// ============================================================================
async function listMenuItems({ q = '', category = '', availability = '' } = {}) {
  const params = [];
  const conditions = [];

  if (q && q.trim()) {
    params.push(`%${q.trim()}%`);
    conditions.push(`(code ILIKE $${params.length} OR name ILIKE $${params.length} OR description ILIKE $${params.length})`);
  }
  if (category && category.trim()) {
    params.push(category.trim());
    conditions.push(`category = $${params.length}`);
  }
  if (availability === 'available') {
    conditions.push(`is_available = TRUE`);
  } else if (availability === 'unavailable') {
    conditions.push(`is_available = FALSE`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const res = await db.query(
    `SELECT id, code, name, category, price, unit, is_available, description, created_at
     FROM menu_items
     ${whereClause}
     ORDER BY code ASC`,
    params
  );
  return res.rows;
}

async function getMenuItemById(id) {
  const res = await db.query('SELECT * FROM menu_items WHERE id = $1', [id]);
  return res.rows[0] || null;
}

async function createMenuItem({ code, name, category, price, unit, is_available, description }) {
  const res = await db.query(
    `INSERT INTO menu_items (code, name, category, price, unit, is_available, description)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [code, name, category, price, unit, is_available, description]
  );
  return res.rows[0];
}

async function updateMenuItem(id, { name, category, price, unit, is_available, description }) {
  const res = await db.query(
    `UPDATE menu_items
     SET name = $1, category = $2, price = $3, unit = $4, is_available = $5, description = $6
     WHERE id = $7
     RETURNING *`,
    [name, category, price, unit, is_available, description, id]
  );
  return res.rows[0] || null;
}

async function toggleMenuItemAvailability(id) {
  const res = await db.query(
    `UPDATE menu_items SET is_available = NOT is_available WHERE id = $1 RETURNING *`,
    [id]
  );
  return res.rows[0] || null;
}

async function deleteMenuItem(id) {
  const res = await db.query('DELETE FROM menu_items WHERE id = $1 RETURNING *', [id]);
  return res.rows[0] || null;
}

// ============================================================================
// DINING TABLES (BÀN ĂN & KHU VỰC)
// ============================================================================
async function listTables({ area = '', status = '' } = {}) {
  const params = [];
  const conditions = [];

  if (area && area.trim()) {
    params.push(area.trim());
    conditions.push(`t.area = $${params.length}`);
  }
  if (status && status.trim()) {
    params.push(status.trim());
    conditions.push(`t.status = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const res = await db.query(
    `SELECT
       t.*,
       (SELECT count(*)::int FROM orders o WHERE o.table_id = t.id AND o.status IN ('Pending', 'Preparing', 'Served')) AS active_order_count
     FROM dining_tables t
     ${whereClause}
     ORDER BY t.table_code ASC`,
    params
  );
  return res.rows;
}

async function getTableById(id) {
  const res = await db.query('SELECT * FROM dining_tables WHERE id = $1', [id]);
  return res.rows[0] || null;
}

async function createTable({ table_code, table_name, area, capacity, status, note }) {
  const res = await db.query(
    `INSERT INTO dining_tables (table_code, table_name, area, capacity, status, note)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [table_code, table_name, area, capacity, status, note]
  );
  return res.rows[0];
}

async function updateTableStatus(id, status, note = null) {
  if (note !== null) {
    const res = await db.query(
      `UPDATE dining_tables SET status = $1, note = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *`,
      [status, note, id]
    );
    return res.rows[0] || null;
  }
  const res = await db.query(
    `UPDATE dining_tables SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
    [status, id]
  );
  return res.rows[0] || null;
}

async function deleteTable(id) {
  const res = await db.query('DELETE FROM dining_tables WHERE id = $1 RETURNING *', [id]);
  return res.rows[0] || null;
}

// ============================================================================
// ORDERS & ORDER ITEMS (ĐƠN HÀNG / PHIẾU GỌI MÓN)
// ============================================================================
async function listOrders({ q = '', status = '', table_id = '' } = {}) {
  const params = [];
  const conditions = [];

  if (q && q.trim()) {
    params.push(`%${q.trim()}%`);
    conditions.push(`(o.order_code ILIKE $${params.length} OR o.customer_name ILIKE $${params.length} OR o.note ILIKE $${params.length})`);
  }
  if (status && status.trim()) {
    params.push(status.trim());
    conditions.push(`o.status = $${params.length}`);
  }
  if (table_id && Number.isInteger(Number(table_id)) && Number(table_id) > 0) {
    params.push(Number(table_id));
    conditions.push(`o.table_id = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const res = await db.query(
    `SELECT
       o.*,
       t.table_code, t.table_name, t.area,
       (SELECT count(*)::int FROM order_items oi WHERE oi.order_id = o.id) AS item_count,
       (SELECT count(*)::int FROM order_items oi WHERE oi.order_id = o.id AND oi.item_status = 'Served') AS served_item_count
     FROM orders o
     JOIN dining_tables t ON t.id = o.table_id
     ${whereClause}
     ORDER BY o.id DESC`,
    params
  );
  return res.rows;
}

async function getOrderWithItems(orderId) {
  const orderRes = await db.query(
    `SELECT o.*, t.table_code, t.table_name, t.area, t.capacity, t.status AS table_status
     FROM orders o
     JOIN dining_tables t ON t.id = o.table_id
     WHERE o.id = $1`,
    [orderId]
  );
  if (orderRes.rows.length === 0) return null;

  const itemsRes = await db.query(
    `SELECT oi.*, m.code AS menu_code, m.name AS menu_name, m.category AS menu_category, m.unit AS menu_unit
     FROM order_items oi
     JOIN menu_items m ON m.id = oi.menu_item_id
     WHERE oi.order_id = $1
     ORDER BY oi.id ASC`,
    [orderId]
  );

  return {
    order: orderRes.rows[0],
    items: itemsRes.rows
  };
}

async function recalculateOrderTotal(orderId) {
  const itemsRes = await db.query('SELECT quantity, unit_price FROM order_items WHERE order_id = $1', [orderId]);
  const total = calculateOrderTotal(itemsRes.rows);
  const upd = await db.query(
    'UPDATE orders SET total_amount = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
    [total, orderId]
  );
  return upd.rows[0] || null;
}

async function createOrder({ order_code, table_id, customer_name, guest_count, status, payment_method, note, created_by, initial_menu_item_id, initial_quantity }) {
  const res = await db.query(
    `INSERT INTO orders (order_code, table_id, customer_name, guest_count, status, payment_method, total_amount, note, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, 0, $7, $8)
     RETURNING *`,
    [order_code, table_id, customer_name, guest_count, status, payment_method, note, created_by || 'admin']
  );
  const order = res.rows[0];

  const menuId = Number.parseInt(initial_menu_item_id, 10);
  const qty = Number.parseInt(initial_quantity || '1', 10);
  if (Number.isInteger(menuId) && menuId > 0 && Number.isInteger(qty) && qty > 0) {
    const menuItem = await getMenuItemById(menuId);
    if (menuItem) {
      await db.query(
        `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, item_status, note)
         VALUES ($1, $2, $3, $4, 'Queued', 'Món gọi khi mở bàn')`,
        [order.id, menuItem.id, qty, menuItem.price]
      );
      await recalculateOrderTotal(order.id);
    }
  }

  if (['Pending', 'Preparing', 'Served'].includes(status)) {
    await updateTableStatus(table_id, 'Occupied');
  }

  return (await getOrderWithItems(order.id)).order;
}

async function updateOrderStatus(orderId, status, payment_method = null) {
  let upd;
  if (payment_method) {
    upd = await db.query(
      `UPDATE orders SET status = $1, payment_method = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *`,
      [status, payment_method, orderId]
    );
  } else {
    upd = await db.query(
      `UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
      [status, orderId]
    );
  }
  const order = upd.rows[0];
  if (order) {
    if (status === 'Paid' || status === 'Cancelled') {
      await updateTableStatus(order.table_id, 'Available');
    } else if (['Pending', 'Preparing', 'Served'].includes(status)) {
      await updateTableStatus(order.table_id, 'Occupied');
    }
  }
  return order || null;
}

async function addOrderItem(orderId, { menu_item_id, quantity, item_status = 'Queued', note = '' }) {
  const menuItem = await getMenuItemById(Number(menu_item_id));
  if (!menuItem) throw new Error('Món ăn không tồn tại.');
  const qty = Math.max(1, Number.parseInt(quantity || '1', 10));

  await db.query(
    `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, item_status, note)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [orderId, menuItem.id, qty, menuItem.price, item_status, String(note || '').trim()]
  );

  return recalculateOrderTotal(orderId);
}

async function updateOrderItemStatus(itemId, item_status) {
  const res = await db.query(
    `UPDATE order_items SET item_status = $1 WHERE id = $2 RETURNING *`,
    [item_status, itemId]
  );
  return res.rows[0] || null;
}

async function deleteOrderItem(orderId, itemId) {
  await db.query('DELETE FROM order_items WHERE id = $1 AND order_id = $2', [itemId, orderId]);
  return recalculateOrderTotal(orderId);
}

async function deleteOrder(orderId) {
  const res = await db.query('DELETE FROM orders WHERE id = $1 RETURNING *', [orderId]);
  return res.rows[0] || null;
}

// ============================================================================
// USERS & AUDIT LOGS
// ============================================================================
async function findUserByUsername(username) {
  const res = await db.query('SELECT * FROM users WHERE username = $1', [username]);
  return res.rows[0] || null;
}

async function recordAudit({ username, action, entity_type, entity_id = '', details = '', ip_address = '127.0.0.1' }) {
  await db.query(
    `INSERT INTO audit_logs (username, action, entity_type, entity_id, details, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [username || 'anonymous', action, entity_type, String(entity_id || ''), details, ip_address]
  );
}

async function listAuditLogs(limit = 50) {
  const res = await db.query(
    `SELECT id, username, action, entity_type, entity_id, details, ip_address, created_at
     FROM audit_logs
     ORDER BY id DESC
     LIMIT $1`,
    [limit]
  );
  return res.rows;
}

module.exports = {
  getHealthStatus,
  getDashboardStats,
  listMenuItems,
  getMenuItemById,
  createMenuItem,
  updateMenuItem,
  toggleMenuItemAvailability,
  deleteMenuItem,
  listTables,
  getTableById,
  createTable,
  updateTableStatus,
  deleteTable,
  listOrders,
  getOrderWithItems,
  recalculateOrderTotal,
  createOrder,
  updateOrderStatus,
  addOrderItem,
  updateOrderItemStatus,
  deleteOrderItem,
  deleteOrder,
  findUserByUsername,
  recordAudit,
  listAuditLogs
};
