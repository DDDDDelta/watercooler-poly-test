import { generateReqId, WSClient, type TemplateCard, type WsFrame } from '@wecom/aibot-node-sdk';

export type Card = TemplateCard;

export interface IncomingText {
  /** The sender's WeCom userid. */
  userId: string;
  /** The group chat id; null in a one-on-one chat. */
  chatId: string | null;
  text: string;
  /** Stream a reply: each call replaces the text, `finish` ends the message. */
  reply(content: string, finish: boolean): Promise<void>;
  /** Send a card under the reply. */
  replyCard(card: Card): Promise<void>;
}

export interface CardClick {
  userId: string;
  chatId: string | null;
  key: string;
  taskId: string;
  /** Replace the card, for everyone or only for `onlyFor`. Has to happen within 5 seconds of the click. */
  update(card: Card, onlyFor?: string[]): Promise<void>;
}

/** The slice of the WeCom bot connection the app uses, so tests can swap in a fake. */
export interface WecomTransport {
  onText(handler: (msg: IncomingText) => void): void;
  onCardClick(handler: (click: CardClick) => void): void;
  /** Push a markdown message into a chat. */
  send(chatId: string, markdown: string): Promise<void>;
  /** Whether the connection is up and authenticated. */
  ready(): boolean;
  close(): void;
}

/**
 * Who clicked which button on which card. WeCom nests the click under `event.template_card_event`;
 * the SDK's types and README put `event_key`/`task_id` on `event` itself, so accept both.
 */
export function parseCardClick(body: unknown): Omit<CardClick, 'update'> | null {
  const b = body as
    { from?: { userid?: string }; chattype?: string; chatid?: string; event?: Record<string, unknown> } | undefined;
  const event = b?.event;
  const click = (event?.template_card_event ?? event) as { event_key?: unknown; task_id?: unknown } | undefined;
  const userId = b?.from?.userid;
  if (!userId || typeof click?.event_key !== 'string' || typeof click.task_id !== 'string') return null;
  return {
    userId,
    chatId: b.chattype === 'group' ? (b.chatid ?? null) : null,
    key: click.event_key,
    taskId: click.task_id,
  };
}

/** Long connection to the WeCom smart bot (企业微信智能机器人) via the official SDK. */
export function connectWecom(opts: { botId: string; secret: string }, log: (m: string) => void): WecomTransport {
  const client = new WSClient({
    botId: opts.botId,
    secret: opts.secret,
    maxReconnectAttempts: -1,
    // The SDK logs every retry; connection problems are reported once below instead.
    logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
  });
  let authenticated = false;
  let lastError = '';
  client.on('authenticated', () => {
    authenticated = true;
    lastError = '';
    log('connected');
  });
  client.on('disconnected', (reason) => {
    if (authenticated) log(`disconnected (${reason}), reconnecting`);
    authenticated = false;
  });
  client.on('event.disconnected_event', () => log('another connection with the same bot took over'));
  client.on('error', (err) => {
    // While retrying, the same error repeats every attempt; log it when it changes.
    if (err.message !== lastError) log(`error: ${err.message}`);
    lastError = err.message;
  });
  client.connect();

  const incoming = (frame: WsFrame, text: string): IncomingText | null => {
    const body = frame.body;
    if (!body?.from?.userid) return null;
    const chatId = body.chattype === 'group' ? (body.chatid ?? null) : null;
    const streamId = generateReqId('stream');
    return {
      userId: body.from.userid,
      chatId,
      text,
      reply: async (content, finish) => {
        await client.replyStream(frame, streamId, content, finish);
      },
      replyCard: async (card) => {
        try {
          await client.replyTemplateCard(frame, card);
        } catch (err) {
          // Fall back to a pushed message if the card cannot ride on this reply.
          if (!chatId) throw err;
          await client.sendMessage(chatId, { msgtype: 'template_card', template_card: card });
        }
      },
    };
  };

  return {
    onText(handler) {
      client.on('message.text', (frame) => {
        const msg = incoming(frame, frame.body?.text?.content ?? '');
        if (msg) handler(msg);
      });
      // Voice messages arrive already transcribed.
      client.on('message.voice', (frame) => {
        const msg = incoming(frame, frame.body?.voice?.content ?? '');
        if (msg) handler(msg);
      });
    },
    onCardClick(handler) {
      client.on('event.template_card_event', (frame) => {
        const click = parseCardClick(frame.body);
        if (!click) {
          log(`ignored a card event without a button key: ${JSON.stringify(frame.body?.event).slice(0, 300)}`);
          return;
        }
        handler({
          ...click,
          update: async (card, onlyFor) => {
            await client.updateTemplateCard(frame, card, onlyFor);
          },
        });
      });
    },
    send: async (chatId, markdown) => {
      await client.sendMessage(chatId, { msgtype: 'markdown', markdown: { content: markdown } });
    },
    ready: () => authenticated && client.isConnected,
    close: () => client.disconnect(),
  };
}
