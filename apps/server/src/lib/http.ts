import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { z } from 'zod';

/** An error whose message is safe to show to the user. */
export class HttpError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (message: string) => new HttpError(400, message);
export const unauthorized = (message = '请先登录') => new HttpError(401, message);
export const forbidden = (message = '没有权限') => new HttpError(403, message);
export const notFound = (message = '不存在') => new HttpError(404, message);
export const conflict = (message: string) => new HttpError(409, message);

/** Parse and validate a JSON request body. */
export async function parseBody<S extends z.ZodType>(c: Context, schema: S): Promise<z.output<S>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw badRequest('请求格式错误');
  }
  const result = schema.safeParse(raw);
  if (!result.success) throw badRequest(result.error.issues[0]?.message ?? '参数错误');
  return result.data;
}

export function parseId(value: string | undefined): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw notFound();
  return id;
}
