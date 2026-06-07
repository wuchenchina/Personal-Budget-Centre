export interface ApiErrorPayload {
  code: string;
  message: string;
  meta?: Record<string, unknown>;
}

export interface ApiResponse<T> {
  ok: boolean;
  data: T | null;
  error: ApiErrorPayload | null;
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '';
let csrfToken: string | null = null;

const apiErrorMessages: Record<string, string> = {
  AUTHENTICATION_FAILED: '认证失败，请重新登录。',
  BUDGET_NOT_FOUND: '预算不存在或已被删除。',
  CSRF_TOKEN_INVALID: '登录状态已过期，请重新登录。',
  DATABASE_NOT_CONFIGURED: '数据库尚未配置完成。',
  DATABASE_UNAVAILABLE: '数据库暂时不可用。',
  EMAIL_ALREADY_EXISTS: '邮箱已被注册。',
  EMAIL_NOT_VERIFIED: '邮箱尚未验证，请先完成邮箱验证。',
  EXCHANGE_RATE_NOT_FOUND: '汇率缺失，请刷新 BOCHK 汇率，或填写手动汇率。',
  EXPORT_FAILED: '导出文件创建失败，请检查 PHP 扩展与导出目录权限。',
  EXPORT_STORAGE_UNWRITABLE: '导出目录不可写，请设置 EXPORT_STORAGE_DIR 或授予写入权限。',
  FORBIDDEN: '当前账号没有权限执行此操作。',
  INVALID_CREDENTIALS: '用户名、邮箱或密码不正确。',
  INVALID_EMAIL_TOKEN: '邮箱验证链接无效或已过期。',
  MAIL_DELIVERY_FAILED: '验证邮件发送失败，请稍后再试。',
  MISSING_SEED_DATA: '基础数据缺失，请先初始化数据库。',
  NOT_FOUND: '接口不存在。',
  PERMISSION_DENIED: '当前账号没有权限执行此操作。',
  TEMPLATE_NOT_FOUND: '预算模板缺失，请先初始化模板数据。',
  UNAUTHENTICATED: '请先登录。',
  USER_NOT_FOUND: '用户不存在或已被删除。',
  USERNAME_ALREADY_EXISTS: '用户名已被注册。',
  VALIDATION_ERROR: '输入内容不符合要求。',
};

interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
}

export function clearCsrfToken() {
  csrfToken = null;
}

export function apiUrl(path: string): string {
  return `${apiBaseUrl}${path}`;
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (csrfToken !== null && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    headers['X-CSRF-Token'] = csrfToken;
  }

  const response = await fetch(apiUrl(path), {
    method,
    credentials: 'include',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const responseText = await response.text();
  const payload = parseApiResponse<T>(responseText, response.status);

  if (!response.ok || !payload.ok || payload.data === null) {
    if (
      payload.error?.code === 'UNAUTHENTICATED'
      || payload.error?.code === 'CSRF_TOKEN_INVALID'
    ) {
      clearCsrfToken();
    }

    throw new Error(readableApiError(payload.error, response.status));
  }

  updateCsrfToken(payload.data);

  return payload.data;
}

function readableApiError(error: ApiErrorPayload | null, status: number): string {
  if (error?.code !== undefined && apiErrorMessages[error.code] !== undefined) {
    return apiErrorMessages[error.code];
  }

  return error?.message ?? `请求失败：${status}`;
}

function parseApiResponse<T>(responseText: string, status: number): ApiResponse<T> {
  try {
    return JSON.parse(responseText) as ApiResponse<T>;
  } catch {
    const normalizedText = responseText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const detail = normalizedText.length > 0 ? `：${normalizedText.slice(0, 180)}` : '';

    throw new Error(`服务器返回了非 JSON 响应，请检查 PHP warning、扩展或目录权限${detail || `：${status}`}`);
  }
}

function updateCsrfToken(data: unknown) {
  if (typeof data === 'object' && data !== null && 'csrfToken' in data) {
    const nextToken = (data as { csrfToken?: unknown }).csrfToken;
    if (typeof nextToken === 'string') {
      csrfToken = nextToken;
    }
  }

  if (typeof data === 'object' && data !== null && 'session' in data) {
    updateCsrfToken((data as { session?: unknown }).session);
  }
}

export function apiGet<T>(path: string): Promise<T> {
  return apiRequest<T>(path);
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>(path, {
    method: 'POST',
    body,
  });
}

export function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>(path, {
    method: 'PATCH',
    body,
  });
}

export function apiDelete<T>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>(path, {
    method: 'DELETE',
    body,
  });
}
