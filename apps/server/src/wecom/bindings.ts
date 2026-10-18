import { createHash, randomBytes } from 'node:crypto';
import type { WecomBinding, WecomBindRequest } from '@watercooler/shared';
import type { DB } from '../db';
import { conflict, forbidden, notFound } from '../lib/http';
import { MINUTE } from '../lib/time';

/** Binding links are posted in a group chat, so they expire quickly and work once. */
export const BIND_TOKEN_TTL = 10 * MINUTE;

export interface BindingRow {
  wecom_userid: string;
  user_id: number;
  chat_id: string | null;
  created_at: number;
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export const toWecomBinding = (b: BindingRow): WecomBinding => ({
  wecomUserId: b.wecom_userid,
  createdAt: b.created_at,
});

export function getBindingByWecom(db: DB, wecomUserId: string): BindingRow | undefined {
  return db.prepare('SELECT * FROM wecom_bindings WHERE wecom_userid = ?').get(wecomUserId) as BindingRow | undefined;
}

export function getBindingByUser(db: DB, userId: number): BindingRow | undefined {
  return db.prepare('SELECT * FROM wecom_bindings WHERE user_id = ?').get(userId) as BindingRow | undefined;
}

/** Remember the group someone last talked to the bot in; their notices go there. */
export function touchBindingChat(db: DB, wecomUserId: string, chatId: string): void {
  db.prepare('UPDATE wecom_bindings SET chat_id = ? WHERE wecom_userid = ?').run(chatId, wecomUserId);
}

/** A fresh single-use binding token for a WeCom user; older unused ones stop working. */
export function createBindToken(db: DB, wecomUserId: string, chatId: string, now: number): string {
  const token = randomBytes(24).toString('base64url');
  db.transaction(() => {
    db.prepare('DELETE FROM wecom_bind_tokens WHERE wecom_userid = ? OR expires_at <= ?').run(wecomUserId, now);
    db.prepare('INSERT INTO wecom_bind_tokens (token_hash, wecom_userid, chat_id, expires_at) VALUES (?, ?, ?, ?)').run(
      hashToken(token),
      wecomUserId,
      chatId,
      now + BIND_TOKEN_TTL,
    );
  })();
  return token;
}

interface TokenRow {
  token_hash: string;
  wecom_userid: string;
  chat_id: string;
  expires_at: number;
}

function findToken(db: DB, token: string, now: number): TokenRow {
  const row = db.prepare('SELECT * FROM wecom_bind_tokens WHERE token_hash = ?').get(hashToken(token)) as
    TokenRow | undefined;
  if (!row || row.expires_at <= now) throw notFound('绑定链接无效或已过期，请在群里重新 @机器人 获取');
  return row;
}

export function describeBindToken(db: DB, token: string, userId: number, now: number): WecomBindRequest {
  const row = findToken(db, token, now);
  const current = getBindingByUser(db, userId);
  return {
    wecomUserId: row.wecom_userid,
    expiresAt: row.expires_at,
    current: current ? toWecomBinding(current) : null,
  };
}

/**
 * Bind the signed-in user to the WeCom account the token was issued to, replacing the user's
 * previous binding. A WeCom account that is already bound has to be unbound first.
 */
export function confirmBinding(db: DB, token: string, userId: number, now: number): BindingRow {
  return db.transaction(() => {
    const row = findToken(db, token, now);
    const user = db.prepare('SELECT is_bot FROM users WHERE id = ?').get(userId) as { is_bot: 0 | 1 } | undefined;
    if (!user || user.is_bot) throw forbidden('机器人账号不能绑定企业微信');
    const existing = getBindingByWecom(db, row.wecom_userid);
    if (existing && existing.user_id !== userId) {
      throw conflict('这个企业微信账号已经绑定了别的账号，请先在群里对机器人说「解绑」');
    }
    db.prepare('DELETE FROM wecom_bind_tokens WHERE token_hash = ?').run(row.token_hash);
    db.prepare('DELETE FROM wecom_bindings WHERE user_id = ? OR wecom_userid = ?').run(userId, row.wecom_userid);
    db.prepare('INSERT INTO wecom_bindings (wecom_userid, user_id, chat_id, created_at) VALUES (?, ?, ?, ?)').run(
      row.wecom_userid,
      userId,
      row.chat_id,
      now,
    );
    return getBindingByWecom(db, row.wecom_userid)!;
  })();
}

/** Returns the removed binding, if there was one. */
export function unbindUser(db: DB, userId: number): BindingRow | undefined {
  const row = getBindingByUser(db, userId);
  if (row) db.prepare('DELETE FROM wecom_bindings WHERE user_id = ?').run(userId);
  return row;
}
