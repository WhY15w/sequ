export type ReplyPayload<T = unknown> = {
  success: boolean;
  message: string;
  code: number;
  data?: T;
  status?: number;
  [key: string]: unknown;
};

/**
 * 统一响应结构生成器，返回原始响应对象，不额外修改 code。
 */
const reply = <T = unknown>(payload: ReplyPayload<T>): ReplyPayload<T> => {
  return payload;
};

/**
 * 成功响应，默认 code 为 200。
 */
export const success = <T = unknown>(
  data?: T,
  message = '数据返回成功',
  code = 200,
  extra: Record<string, unknown> = {},
) =>
  reply({
    success: true,
    message,
    code,
    ...(data === undefined ? {} : { data }),
    ...extra,
  });

/**
 * 失败响应，默认 code 为 500。
 */
export const fail = <T = unknown>(
  message = '数据返回失败',
  data?: T,
  code = 500,
  extra: Record<string, unknown> = {},
) =>
  reply({
    success: false,
    message,
    code,
    ...(data === undefined ? {} : { data }),
    ...extra,
  });

/**
 * 参数错误响应，返回 code 400。
 */
export const badRequest = <T = unknown>(
  message = '请求参数错误',
  data?: T,
  extra: Record<string, unknown> = {},
) => fail(message, data, 400, extra);

/**
 * 未授权响应，返回 code 401。
 */
export const unauthorized = <T = unknown>(
  message = '未授权',
  data?: T,
  extra: Record<string, unknown> = {},
) => fail(message, data, 401, extra);

/**
 * 禁止访问响应，返回 code 403。
 */
export const forbidden = <T = unknown>(
  message = '禁止访问',
  data?: T,
  extra: Record<string, unknown> = {},
) => fail(message, data, 403, extra);

/**
 * 资源未找到响应，返回 code 404。
 */
export const notFound = <T = unknown>(
  message = '资源未找到',
  data?: T,
  extra: Record<string, unknown> = {},
) => fail(message, data, 404, extra);

/**
 * 服务器内部错误响应，返回 code 500。
 */
export const internalServerError = <T = unknown>(
  message = '服务器内部错误',
  data?: T,
  extra: Record<string, unknown> = {},
) => fail(message, data, 500, extra);

export { reply };
