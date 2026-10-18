/**
 * Maintenance commands for whoever runs the server (there are no in-app admins).
 *   pnpm --filter @watercooler/server cli reset-password <username> <new-password>
 * On a deployed server: ~/<instance>/<instance>.sh reset-password <username> <new-password>
 */
import { registerSchema } from '@watercooler/shared';
import { loadConfig, loadDotEnv } from './config';
import { openDatabase } from './db';
import { hashPassword } from './lib/password';
import { revokeSessions } from './lib/session';
import { getUserByUsername } from './services/users';

const USAGE = 'usage: cli reset-password <username> <new-password>';

loadDotEnv();
const [command, ...args] = process.argv.slice(2);

if (command === 'reset-password') {
  const [username, password] = args;
  if (!username || !password) fail(USAGE);
  const checked = registerSchema.shape.password.safeParse(password);
  if (!checked.success) fail(checked.error.issues[0]?.message ?? '密码不符合要求');
  const db = openDatabase(loadConfig().databasePath);
  const user = getUserByUsername(db, username);
  if (!user) fail(`用户 ${username} 不存在`);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(password), user.id);
  revokeSessions(null, db, user.id, false);
  db.close();
  console.log(`已重置 ${user.username}（${user.display_name}）的密码，这个账号已在所有设备上退出登录。`);
} else {
  fail(USAGE);
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
