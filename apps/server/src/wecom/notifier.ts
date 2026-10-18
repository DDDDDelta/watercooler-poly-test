import { CURRENCY_NAME, fromCents, RESOLVE_GRACE_DAYS } from '@watercooler/shared';
import type { DB } from '../db';
import { DAY } from '../lib/time';
import type { MarketRow } from '../services/markets';
import { marketUrl } from './tools';
import type { WecomTransport } from './transport';

/** Only events this recent are announced, so turning the bot on does not replay old history. */
const LOOKBACK = DAY;

export interface NotifierDeps {
  db: DB;
  transport: Pick<WecomTransport, 'send' | 'ready'>;
  siteUrl: string;
  now: () => number;
  log: (m: string) => void;
}

/** Record a notice; false if it was already sent. */
function claim(db: DB, kind: string, marketId: number, now: number): boolean {
  return (
    db
      .prepare('INSERT OR IGNORE INTO wecom_notices (kind, market_id, created_at) VALUES (?, ?, ?)')
      .run(kind, marketId, now).changes > 0
  );
}

const money = (cents: number) => `${fromCents(cents)}`;
const signed = (cents: number) => (cents > 0 ? `+${money(cents)}` : cents < 0 ? `-${money(-cents)}` : '±0');

interface BettorResult {
  display_name: string;
  chat_id: string;
  staked: number;
  returned: number;
}

/** Tell each bound bettor how a market they bet on settled, in the group they last used. */
function settlementMessages(deps: NotifierDeps, market: MarketRow): Map<string, string> {
  const { db } = deps;
  const rows = db
    .prepare(
      `SELECT u.display_name, wb.chat_id,
              (SELECT SUM(amount) FROM bets WHERE market_id = @m AND user_id = u.id) AS staked,
              (SELECT COALESCE(SUM(amount), 0) FROM ledger
                WHERE market_id = @m AND user_id = u.id AND kind IN ('payout', 'refund')) AS returned
         FROM wecom_bindings wb JOIN users u ON u.id = wb.user_id
        WHERE wb.chat_id IS NOT NULL
          AND EXISTS (SELECT 1 FROM bets WHERE market_id = @m AND user_id = u.id)
        ORDER BY u.id`,
    )
    .all({ m: market.id }) as BettorResult[];
  const byChat = new Map<string, BettorResult[]>();
  for (const r of rows) byChat.set(r.chat_id, [...(byChat.get(r.chat_id) ?? []), r]);

  const winner =
    market.status === 'resolved'
      ? (db.prepare('SELECT label FROM outcomes WHERE id = ?').get(market.resolved_outcome_id) as { label: string })
          .label
      : null;
  // Nobody backed the winner: everyone got their stake back instead of a payout.
  const refunded =
    winner !== null && !db.prepare(`SELECT 1 FROM ledger WHERE market_id = ? AND kind = 'payout'`).get(market.id);
  const head =
    winner !== null
      ? `📢 「${market.question}」公布结果：**${winner}**`
      : `📢 「${market.question}」已取消，押注全部退还`;
  const messages = new Map<string, string>();
  for (const [chatId, people] of byChat) {
    const lines = people.map((p) => {
      if (winner === null) return `- ${p.display_name}：退回 ${money(p.returned)}`;
      if (refunded) return `- ${p.display_name}：没人押中，退回 ${money(p.returned)}`;
      return p.returned > 0
        ? `- ${p.display_name}：押 ${money(p.staked)}，拿回 ${money(p.returned)}（${signed(p.returned - p.staked)}）`
        : `- ${p.display_name}：押 ${money(p.staked)}，没押中（${signed(-p.staked)}）`;
    });
    const note = market.resolution_note ? `\n> ${market.resolution_note}` : '';
    messages.set(
      chatId,
      `${head}${note}\n${lines.join('\n')}\n单位：${CURRENCY_NAME}。[查看市场](${marketUrl(deps.siteUrl, market.id)})`,
    );
  }
  return messages;
}

interface ReminderRow extends MarketRow {
  display_name: string;
  chat_id: string;
}

/** Bound creators of markets past a time, not yet reminded with `kind`. */
function remindersDue(db: DB, kind: string, closedBefore: number, closedAfter: number): ReminderRow[] {
  return db
    .prepare(
      `SELECT m.*, u.display_name, wb.chat_id
         FROM markets m
         JOIN users u ON u.id = m.creator_id
         JOIN wecom_bindings wb ON wb.user_id = m.creator_id
        WHERE m.status = 'open' AND m.is_ai = 0 AND wb.chat_id IS NOT NULL
          AND m.close_at <= ? AND m.close_at > ?
          AND NOT EXISTS (SELECT 1 FROM wecom_notices n WHERE n.kind = ? AND n.market_id = m.id)`,
    )
    .all(closedBefore, closedAfter, kind) as ReminderRow[];
}

/** One pass: settlement results, then reminders for creators who still have to announce a result. */
export async function sendNotices(deps: NotifierDeps): Promise<void> {
  const { db, transport, log } = deps;
  if (!transport.ready()) return;
  const now = deps.now();
  const send = async (chatId: string, text: string) => {
    try {
      await transport.send(chatId, text);
    } catch (err) {
      log(`notice to ${chatId} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const settled = db
    .prepare(
      `SELECT * FROM markets m WHERE m.status IN ('resolved', 'cancelled') AND m.resolved_at > ?
          AND NOT EXISTS (SELECT 1 FROM wecom_notices n WHERE n.kind = 'settled' AND n.market_id = m.id)
        ORDER BY m.resolved_at`,
    )
    .all(now - LOOKBACK) as MarketRow[];
  for (const market of settled) {
    if (!claim(db, 'settled', market.id, now)) continue;
    for (const [chatId, text] of settlementMessages(deps, market)) await send(chatId, text);
  }

  for (const m of remindersDue(db, 'closed', now, now - LOOKBACK)) {
    if (!claim(db, 'closed', m.id, now)) continue;
    await send(
      m.chat_id,
      `⏰ ${m.display_name}，你建的「${m.question}」已经截止下注，可以公布结果了：@我 说「结果是 …」，或者[去网站公布](${marketUrl(deps.siteUrl, m.id)})。${RESOLVE_GRACE_DAYS} 天内不公布会自动取消并退款。`,
    );
  }

  const lastDay = now - (RESOLVE_GRACE_DAYS - 1) * DAY;
  for (const m of remindersDue(db, 'deadline', lastDay, now - RESOLVE_GRACE_DAYS * DAY)) {
    if (!claim(db, 'deadline', m.id, now)) continue;
    await send(
      m.chat_id,
      `⚠️ ${m.display_name}，「${m.question}」还没公布结果，再过一天就会自动取消、全额退款。[去公布](${marketUrl(deps.siteUrl, m.id)})`,
    );
  }
}

/** Check for notices once a minute. Returns a function that stops it. */
export function startNotifier(deps: NotifierDeps): () => void {
  let busy = false;
  const tick = () => {
    if (busy) return;
    busy = true;
    sendNotices(deps)
      .catch((err: unknown) => deps.log(`notices failed: ${err instanceof Error ? err.message : String(err)}`))
      .finally(() => {
        busy = false;
      });
  };
  const timer = setInterval(tick, 60_000);
  timer.unref();
  return () => clearInterval(timer);
}
