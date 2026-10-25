const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const logger = require('./logger');

const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.POSTGRES_DB || 'ro_db',
  user: process.env.APP_DB_USER || 'ro_app',
  password: process.env.APP_DB_PASSWORD || 'ChangeMeAppPass123!',
  max: 15,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

pool.on('error', (err) => {
  logger.error('db_pool_error', 'Unexpected PostgreSQL pool error', { error: err.message });
});

async function ensureAdminAccount() {
  const adminUser = process.env.APP_ADMIN_USER || 'admin';
  const adminPass = process.env.APP_ADMIN_PASSWORD;
  const adminEmail = process.env.APP_ADMIN_EMAIL || 'dtc245200485@ictu.edu.vn';

  if (!adminPass) return;

  try {
    const res = await pool.query('SELECT id, password_hash FROM users WHERE username = $1', [adminUser]);
    if (res.rows.length === 0) {
      const hash = await bcrypt.hash(adminPass, 10);
      await pool.query(
        'INSERT INTO users (username, email, password_hash, full_name, role) VALUES ($1, $2, $3, $4, $5)',
        [adminUser, adminEmail, hash, 'Phạm Văn Tuân (Quản trị viên)', 'admin']
      );
      logger.info('admin_seeded', 'Created default admin user in PostgreSQL', { username: adminUser });
    } else {
      const match = await bcrypt.compare(adminPass, res.rows[0].password_hash);
      if (!match) {
        const hash = await bcrypt.hash(adminPass, 10);
        await pool.query('UPDATE users SET password_hash = $1, email = $2 WHERE username = $3', [
          hash,
          adminEmail,
          adminUser
        ]);
        logger.info('admin_synced', 'Synchronized admin password hash with environment configuration', {
          username: adminUser
        });
      }
    }
  } catch (err) {
    logger.error('admin_sync_failed', 'Failed to synchronize admin user', { error: err.message });
  }
}

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
  ensureAdminAccount
};
