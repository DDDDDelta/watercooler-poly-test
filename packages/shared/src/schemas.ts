import { z } from 'zod';
import {
  DEFAULT_LIQUIDITY,
  MAX_LIQUIDITY,
  MAX_OUTCOMES,
  MAX_TRADE_AMOUNT,
  MIN_LIQUIDITY,
  MIN_OUTCOMES,
  MIN_TRADE_AMOUNT,
} from './constants';

const username = z
  .string()
  .trim()
  .min(2, '用户名至少 2 个字符')
  .max(24, '用户名最多 24 个字符')
  .regex(/^[a-zA-Z0-9_.-]+$/, '用户名只能包含字母、数字、下划线、点和短横线');

const displayName = z.string().trim().min(1, '请填写昵称').max(24, '昵称最多 24 个字符');

const password = z.string().min(6, '密码至少 6 位').max(128, '密码最多 128 位');

export const registerSchema = z.object({
  username,
  displayName,
  password,
  inviteCode: z.string().trim().optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  username: z.string().trim().min(1, '请输入用户名'),
  password: z.string().min(1, '请输入密码'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z.object({
  oldPassword: z.string().min(1, '请输入当前密码'),
  newPassword: password,
});

export const updateProfileSchema = z.object({ displayName });

const outcomeLabel = z.string().trim().min(1, '选项不能为空').max(40, '选项最多 40 个字符');

export const createMarketSchema = z
  .object({
    question: z.string().trim().min(5, '问题至少 5 个字').max(200, '问题最多 200 个字'),
    description: z.string().trim().max(5000, '规则说明最多 5000 字').default(''),
    category: z.string().trim().min(1, '请选择分类').max(20),
    closeAt: z.number().int('截止时间无效'),
    outcomes: z
      .array(outcomeLabel)
      .min(MIN_OUTCOMES, `至少 ${MIN_OUTCOMES} 个选项`)
      .max(MAX_OUTCOMES, `最多 ${MAX_OUTCOMES} 个选项`),
    liquidity: z
      .number()
      .min(MIN_LIQUIDITY, `流动性不能小于 ${MIN_LIQUIDITY}`)
      .max(MAX_LIQUIDITY, `流动性不能大于 ${MAX_LIQUIDITY}`)
      .default(DEFAULT_LIQUIDITY),
    /** Opening probability of the first outcome; binary markets only. */
    initialProbability: z.number().min(0.01, '初始概率范围 1%–99%').max(0.99, '初始概率范围 1%–99%').optional(),
  })
  .refine((v) => new Set(v.outcomes.map((o) => o.toLowerCase())).size === v.outcomes.length, {
    message: '选项不能重复',
    path: ['outcomes'],
  })
  .refine((v) => v.initialProbability === undefined || v.outcomes.length === 2, {
    message: '只有二元市场可以设置初始概率',
    path: ['initialProbability'],
  });
export type CreateMarketInput = z.input<typeof createMarketSchema>;

export const tradeSchema = z.discriminatedUnion('side', [
  z.object({
    side: z.literal('buy'),
    outcomeId: z.number().int(),
    amount: z.number().min(MIN_TRADE_AMOUNT, `最少买入 ${MIN_TRADE_AMOUNT}`).max(MAX_TRADE_AMOUNT, '金额过大'),
    /** Slippage guard: reject if fewer shares would be received. */
    minShares: z.number().min(0).optional(),
  }),
  z.object({
    side: z.literal('sell'),
    outcomeId: z.number().int(),
    shares: z.number().positive('卖出份额必须大于 0'),
    /** Slippage guard: reject if less would be received. */
    minAmount: z.number().min(0).optional(),
  }),
]);
export type TradeInput = z.infer<typeof tradeSchema>;

export const resolveMarketSchema = z.object({
  outcomeId: z.number().int(),
  note: z.string().trim().max(1000).optional(),
});

export const cancelMarketSchema = z.object({
  note: z.string().trim().max(1000).optional(),
});

export const commentSchema = z.object({
  body: z.string().trim().min(1, '评论不能为空').max(1000, '评论最多 1000 字'),
});

export const grantSchema = z.object({
  amount: z
    .number()
    .refine((v) => v !== 0, '金额不能为 0')
    .refine((v) => Math.abs(v) <= MAX_TRADE_AMOUNT, '金额过大'),
  note: z.string().trim().max(200).optional(),
});

export const setRoleSchema = z.object({ role: z.enum(['user', 'admin']) });

export const resetPasswordSchema = z.object({ newPassword: password });
