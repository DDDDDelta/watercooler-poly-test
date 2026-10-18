import { z } from 'zod';
import { MAX_BET, MAX_OUTCOMES, MIN_BET, MIN_OUTCOMES } from './constants';

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
  })
  .refine((v) => new Set(v.outcomes.map((o) => o.toLowerCase())).size === v.outcomes.length, {
    message: '选项不能重复',
    path: ['outcomes'],
  });
export type CreateMarketInput = z.input<typeof createMarketSchema>;

export const betSchema = z.object({
  outcomeId: z.number().int(),
  amount: z.number().min(MIN_BET, `最少下注 ${MIN_BET}`).max(MAX_BET, '金额过大'),
});
export type BetInput = z.infer<typeof betSchema>;

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
