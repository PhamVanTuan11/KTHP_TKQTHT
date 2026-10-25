const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const BACKUPS_DIR = path.join(ROOT, 'backups');

function formatTimestamp(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    d.getFullYear() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    '_' +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

function main() {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  const ts = formatTimestamp();
  const filename = `ro_db_backup_${ts}.sql`;
  const filePath = path.join(BACKUPS_DIR, filename);
  const latestPath = path.join(BACKUPS_DIR, 'latest_ro_db_backup.sql');

  const sqlDump = execFileSync(
    'docker',
    [
      'compose',
      '-f',
      'compose.yaml',
      'exec',
      '-T',
      'postgres',
      'pg_dump',
      '-U',
      'postgres',
      '-d',
      'ro_db',
      '--clean',
      '--if-exists',
      '--no-owner',
      '--no-privileges'
    ],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }
  );

  fs.writeFileSync(filePath, sqlDump, 'utf8');
  fs.writeFileSync(latestPath, sqlDump, 'utf8');

  const stat = fs.statSync(filePath);
  console.log(`[backup] Đã sao lưu thành công CSDL ro_db -> backups/${filename} (${stat.size} bytes)`);
}

main();
