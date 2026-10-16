import type { Comment } from '@watercooler/shared';
import type { DB } from '../db';
import { forbidden, notFound } from '../lib/http';
import { toUserRef, type UserRow } from './users';

interface CommentRow {
  id: number;
  market_id: number;
  user_id: number;
  body: string;
  created_at: number;
  username: string;
  display_name: string;
}

const SELECT = `SELECT c.*, u.username, u.display_name FROM comments c JOIN users u ON u.id = c.user_id`;

const toComment = (r: CommentRow): Comment => ({
  id: r.id,
  user: toUserRef({ id: r.user_id, username: r.username, display_name: r.display_name }),
  body: r.body,
  createdAt: r.created_at,
});

export function listComments(db: DB, marketId: number): Comment[] {
  return (db.prepare(`${SELECT} WHERE c.market_id = ? ORDER BY c.id DESC LIMIT 500`).all(marketId) as CommentRow[]).map(
    toComment,
  );
}

export function addComment(db: DB, marketId: number, userId: number, body: string, now: number): Comment {
  const { lastInsertRowid } = db
    .prepare('INSERT INTO comments (market_id, user_id, body, created_at) VALUES (?, ?, ?, ?)')
    .run(marketId, userId, body, now);
  return toComment(db.prepare(`${SELECT} WHERE c.id = ?`).get(lastInsertRowid) as CommentRow);
}

export function deleteComment(db: DB, commentId: number, actor: UserRow): void {
  const row = db.prepare('SELECT user_id FROM comments WHERE id = ?').get(commentId) as { user_id: number } | undefined;
  if (!row) throw notFound('评论不存在');
  if (row.user_id !== actor.id && actor.role !== 'admin') throw forbidden();
  db.prepare('DELETE FROM comments WHERE id = ?').run(commentId);
}
