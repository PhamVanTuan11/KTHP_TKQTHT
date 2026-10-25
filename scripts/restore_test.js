const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const BACKUPS_DIR = path.join(ROOT, 'backups');
const EVIDENCE_DIR = path.join(ROOT, 'docs', 'evidence');

function runPsql(dbName, sqlCommand, input = undefined) {
  const args = ['compose', '-f', 'compose.yaml', 'exec', '-T', 'postgres', 'psql', '-U', 'postgres', '-d', dbName, '-t', '-A'];
  if (sqlCommand) {
    args.push('-c', sqlCommand);
  }
  return execFileSync('docker', args, {
    cwd: ROOT,
    input,
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024
  }).trim();
}

function findLatestBackupFile() {
  const files = fs
    .readdirSync(BACKUPS_DIR)
    .filter((f) => f.startsWith('ro_db_backup_') && f.endsWith('.sql'))
    .sort()
    .reverse();
  if (files.length === 0) {
    throw new Error('Không tìm thấy file sao lưu trong backups/. Hãy chạy `node scripts/backup.js` trước.');
  }
  return path.join(BACKUPS_DIR, files[0]);
}

function main() {
  const backupFile = findLatestBackupFile();
  const backupSql = fs.readFileSync(backupFile, 'utf8');
  const backupSize = fs.statSync(backupFile).size;

  // Recreate isolated test database ro_restore_test
  runPsql('postgres', 'DROP DATABASE IF EXISTS ro_restore_test;');
  runPsql('postgres', 'CREATE DATABASE ro_restore_test;');

  // Restore SQL dump into ro_restore_test
  runPsql('ro_restore_test', null, backupSql);

  const tables = ['users', 'dining_tables', 'menu_items', 'orders', 'order_items', 'audit_logs'];
  const comparison = [];
  let allMatch = true;

  for (const tbl of tables) {
    const srcCount = Number(runPsql('ro_db', `SELECT count(*) FROM ${tbl};`));
    const restoredCount = Number(runPsql('ro_restore_test', `SELECT count(*) FROM ${tbl};`));
    const match = srcCount === restoredCount && srcCount > 0;
    if (!match) allMatch = false;
    comparison.push({
      table: tbl,
      source_db_count: srcCount,
      restored_db_count: restoredCount,
      matched: match
    });
    console.log(`[restore_test] Bảng ${tbl}: ro_db=${srcCount} | ro_restore_test=${restoredCount} -> ${match ? 'KHỚP 100%' : 'LỆCH'}`);
  }

  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const report = {
    verified_at: new Date().toISOString(),
    source_database: 'ro_db',
    target_test_database: 'ro_restore_test',
    backup_file: path.basename(backupFile),
    backup_size_bytes: backupSize,
    all_tables_matched: allMatch,
    comparison
  };

  fs.writeFileSync(path.join(EVIDENCE_DIR, 'restore_verification.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log(`[restore_test] Hoàn tất kiểm chứng phục hồi độc lập: ${allMatch ? 'PASS (Khớp 100%)' : 'FAIL'}`);
  if (!allMatch) process.exit(1);
}

main();
