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

  const payload = (await response.json()) as ApiResponse<T>;

  if (!response.ok || !payload.ok || payload.data === null) {
    if (
      payload.error?.code === 'UNAUTHENTICATED'
      || payload.error?.code === 'CSRF_TOKEN_INVALID'
    ) {
      clearCsrfToken();
    }

    throw new Error(payload.error?.message ?? `Request failed: ${response.status}`);
  }

  updateCsrfToken(payload.data);

  return payload.data;
}

function updateCsrfToken(data: unknown) {
  if (typeof data === 'object' && data !== null && 'csrfToken' in data) {
    const nextToken = (data as { csrfToken?: unknown }).csrfToken;
    if (typeof nextToken === 'string') {
      csrfToken = nextToken;
    }
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
