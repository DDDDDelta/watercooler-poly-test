import { randomBytes } from 'node:crypto';
import type { CreateMarketInput } from '@watercooler/shared';
import type { DB } from '../db';
import { conflict } from '../lib/http';
import { MINUTE } from '../lib/time';
import { cancelMarket, placeBet, resolveMarket } from '../services/bets';
import { createMarket } from '../services/markets';
import type { Card } from './transport';

/** A confirmation card works this long; after that the owner has to ask again. */
export const ACTION_TTL = 10 * MINUTE;

export type ActionPayload =
  | { kind: 'bet'; marketId: number; outcomeId: number; amount: number }
  | { kind: 'create'; input: CreateMarketInput }
  | { kind: 'resolve'; marketId: number; outcomeId: number; note?: string }
  | { kind: 'cancel'; marketId: number; note?: string };

export interface ActionRow {
  id: number;
  user_id: number;
  wecom_userid: string;
  kind: ActionPayload['kind'];
  payload: string;
  task_id: string;
  status: 'pending' | 'done' | 'failed' | 'cancelled';
  created_at: number;
}

export function createAction(
  db: DB,
  userId: number,
  wecomUserId: string,
  payload: ActionPayload,
  now: number,
): ActionRow {
  // task_id must be unique per bot and use only letters, digits and _-@.
  const taskId = `wc_${now.toString(36)}_${randomBytes(6).toString('hex')}`;
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO wecom_actions (user_id, wecom_userid, kind, payload, task_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(userId, wecomUserId, payload.kind, JSON.stringify(payload), taskId, now);
  return getAction(db, Number(lastInsertRowid))!;
}

export function getAction(db: DB, id: number): ActionRow | undefined {
  return db.prepare('SELECT * FROM wecom_actions WHERE id = ?').get(id) as ActionRow | undefined;
}

export function setActionStatus(db: DB, id: number, status: ActionRow['status']): void {
  db.prepare('UPDATE wecom_actions SET status = ? WHERE id = ?').run(status, id);
}

/**
 * Carry out a confirmed action as its owner. The services re-check everything (market still open,
 * balance, creator), so a card that went stale fails with a readable error instead.
 * Returns the market the action touched.
 */
export function executeAction(db: DB, action: ActionRow, now: number): number {
  return db.transaction(() => {
    const claimed = db
      .prepare(`UPDATE wecom_actions SET status = 'done' WHERE id = ? AND status = 'pending'`)
      .run(action.id);
    if (claimed.changes === 0) throw conflict('这个操作已经处理过了');
    const p = JSON.parse(action.payload) as ActionPayload;
    switch (p.kind) {
      case 'bet':
        placeBet(db, action.user_id, p.marketId, { outcomeId: p.outcomeId, amount: p.amount }, now);
        return p.marketId;
      case 'create':
        return createMarket(db, action.user_id, p.input, now);
      case 'resolve':
        resolveMarket(db, p.marketId, p.outcomeId, action.user_id, p.note, now);
        return p.marketId;
      case 'cancel':
        cancelMarket(db, p.marketId, action.user_id, p.note, now);
        return p.marketId;
    }
  })();
}

/** Card values are best kept short; WeCom truncates long ones anyway. */
export const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

export const confirmKey = (id: number) => `wc_ok_${id}`;
export const rejectKey = (id: number) => `wc_no_${id}`;

/** Parse a button key from a confirmation card. */
export function parseActionKey(key: string): { id: number; confirm: boolean } | null {
  const m = /^wc_(ok|no)_(\d+)$/.exec(key);
  return m ? { id: Number(m[2]), confirm: m[1] === 'ok' } : null;
}

export interface CardText {
  title: string;
  desc?: string;
  /** Up to six label/value rows. */
  rows: [string, string][];
  note?: string;
  /** Opened when the card is tapped. */
  url?: string;
}

const cardAction = (url?: string) => (url ? { card_action: { type: 1 as const, url } } : {});

/** The card with 确认 / 取消 buttons that the owner taps to carry out an action. */
export function confirmationCard(action: ActionRow, text: CardText): Card {
  return {
    card_type: 'button_interaction',
    main_title: { title: clip(text.title, 26), ...(text.desc ? { desc: clip(text.desc, 30) } : {}) },
    ...(text.note ? { sub_title_text: clip(text.note, 112) } : {}),
    horizontal_content_list: text.rows.slice(0, 6).map(([keyname, value]) => ({
      keyname: clip(keyname, 5),
      value: clip(value, 26),
    })),
    ...cardAction(text.url),
    button_list: [
      { text: '确认', key: confirmKey(action.id), style: 1 },
      { text: '取消', key: rejectKey(action.id), style: 2 },
    ],
    task_id: action.task_id,
  };
}

/** What a card turns into once it has been handled (same task_id, no buttons). */
export function noticeCard(taskId: string, title: string, body?: string, url?: string): Card {
  return {
    card_type: 'text_notice',
    main_title: { title: clip(title, 26) },
    ...(body ? { sub_title_text: clip(body, 112) } : {}),
    ...cardAction(url),
    task_id: taskId,
  };
}
