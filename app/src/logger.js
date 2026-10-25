const fs = require('fs');
const path = require('path');

const LOG_DIR = process.env.LOG_DIR || path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'app.log');

function writeLog(level, event, message, meta = {}) {
  const safeMeta = { ...meta };
  delete safeMeta.password;
  delete safeMeta.password_hash;
  delete safeMeta.cookie;
  delete safeMeta._csrf;
  delete safeMeta.sessionId;

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    service: 'restaurant-order-app',
    event,
    message,
    ...safeMeta
  };

  const line = JSON.stringify(entry);
  console.log(line);

  try {
    fs.appendFileSync(LOG_FILE, line + '\n', { encoding: 'utf8' });
  } catch (err) {
    // Fallback if log file is not writable in unit test environment
  }
}

module.exports = {
  info: (event, message, meta) => writeLog('info', event, message, meta),
  warn: (event, message, meta) => writeLog('warn', event, message, meta),
  error: (event, message, meta) => writeLog('error', event, message, meta)
};
