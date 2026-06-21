import { apiErrorMessagesByLanguage, currentLanguage } from '../i18n';

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

  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      method,
      credentials: 'include',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch (error: unknown) {
    if (error instanceof TypeError) {
      throw new Error(networkErrorMessage(), { cause: error });
    }

    throw error;
  }

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
  const language = currentLanguage();
  if (
    error?.code !== undefined
    && apiErrorMessagesByLanguage[language][error.code] !== undefined
  ) {
    return apiErrorMessagesByLanguage[language][error.code];
  }

  return error?.message ?? requestFailedMessage(status);
}

function parseApiResponse<T>(responseText: string, status: number): ApiResponse<T> {
  try {
    return JSON.parse(responseText) as ApiResponse<T>;
  } catch {
    const normalizedText = responseText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const detail = normalizedText.length > 0 ? `：${normalizedText.slice(0, 180)}` : '';

    throw new Error(nonJsonResponseMessage(status, detail));
  }
}

function networkErrorMessage(): string {
  switch (currentLanguage()) {
    case 'en':
      return 'Cannot connect to the server. Please confirm you are using https:// or try again later.';
    case 'sc':
      return '无法连接服务器，请确认正在使用 https:// 访问，或稍后重试。';
    case 'tc':
      return '無法連接伺服器，請確認正在使用 https:// 存取，或稍後重試。';
    case 'ja':
      return 'サーバーに接続できません。https:// でアクセスしていることを確認するか、後でもう一度お試しください。';
    case 'fr':
      return 'Impossible de se connecter au serveur. Vérifiez que vous utilisez https:// ou réessayez plus tard.';
    case 'ru':
      return 'Не удается подключиться к серверу. Убедитесь, что используется https://, или повторите попытку позже.';
    case 'de':
      return 'Es kann keine Verbindung zum Server hergestellt werden. Bitte prüfen Sie https:// oder versuchen Sie es später erneut.';
  }
}

function requestFailedMessage(status: number): string {
  switch (currentLanguage()) {
    case 'en':
      return `Request failed: ${status}`;
    case 'sc':
      return `请求失败：${status}`;
    case 'tc':
      return `請求失敗：${status}`;
    case 'ja':
      return `リクエストに失敗しました：${status}`;
    case 'fr':
      return `La requête a échoué : ${status}`;
    case 'ru':
      return `Запрос завершился ошибкой: ${status}`;
    case 'de':
      return `Anfrage fehlgeschlagen: ${status}`;
  }
}

function nonJsonResponseMessage(status: number, detail: string): string {
  switch (currentLanguage()) {
    case 'en':
      return `The server returned a non-JSON response. Check PHP warnings, extensions, or directory permissions${detail || `: ${status}`}`;
    case 'sc':
      return `服务器返回了非 JSON 响应，请检查 PHP warning、扩展或目录权限${detail || `：${status}`}`;
    case 'tc':
      return `伺服器返回了非 JSON 回應，請檢查 PHP warning、擴充或目錄權限${detail || `：${status}`}`;
    case 'ja':
      return `サーバーが JSON 以外の応答を返しました。PHP warning、拡張機能、またはディレクトリ権限を確認してください${detail || `：${status}`}`;
    case 'fr':
      return `Le serveur a retourné une réponse non JSON. Vérifiez les warnings PHP, les extensions ou les droits du répertoire${detail || ` : ${status}`}`;
    case 'ru':
      return `Сервер вернул ответ не в формате JSON. Проверьте предупреждения PHP, расширения или права каталога${detail || `: ${status}`}`;
    case 'de':
      return `Der Server hat eine Nicht-JSON-Antwort zurückgegeben. Prüfen Sie PHP-Warnungen, Erweiterungen oder Verzeichnisrechte${detail || `: ${status}`}`;
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
