const FEISHU_BASE_URL = 'https://open.feishu.cn';

interface FeishuConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
  scope?: string;
}

interface FeishuApiEnvelope<T> {
  code?: number;
  msg?: string;
  message?: string;
  data?: T;
  [key: string]: unknown;
}

interface FeishuTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
}

export interface FeishuUserInfo {
  name?: string;
  en_name?: string;
  mobile?: string;
  open_id?: string;
  union_id?: string;
  email?: string;
  avatar_url?: string;
}

class FeishuAuthError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = 'FeishuAuthError';
    this.status = status;
  }
}

const getConfig = (): FeishuConfig => {
  const appId = process.env.FEISHU_APP_ID?.trim() || '';
  const appSecret = process.env.FEISHU_APP_SECRET?.trim() || '';
  const redirectUri = process.env.FEISHU_REDIRECT_URI?.trim() || '';
  const scope = process.env.FEISHU_SCOPE?.trim() || '';

  return {
    appId,
    appSecret,
    redirectUri,
    scope: scope || undefined,
  };
};

const parseFeishuEnvelope = <T>(payload: unknown): T => {
  if (!payload || typeof payload !== 'object') {
    throw new FeishuAuthError('飞书返回了无法识别的响应', 502);
  }

  const envelope = payload as FeishuApiEnvelope<T>;
  if (typeof envelope.code === 'number' && envelope.code !== 0) {
    throw new FeishuAuthError(envelope.msg || envelope.message || '飞书接口调用失败', 502);
  }

  if (envelope.data && typeof envelope.data === 'object') {
    return envelope.data;
  }

  return payload as T;
};

const requestJson = async <T>(
  path: string,
  init: RequestInit,
  options?: { expectedStatus?: number[]; fallbackErrors?: number[] }
): Promise<T> => {
  const response = await fetch(`${FEISHU_BASE_URL}${path}`, init);
  const expectedStatus = options?.expectedStatus || [200];
  const fallbackErrors = options?.fallbackErrors || [];

  if (!expectedStatus.includes(response.status)) {
    if (fallbackErrors.includes(response.status)) {
      throw new FeishuAuthError(`__fallback__:${response.status}`, response.status);
    }

    let message = `飞书接口调用失败（${response.status}）`;
    try {
      const payload = await response.json();
      if (payload && typeof payload === 'object') {
        const envelope = payload as FeishuApiEnvelope<T>;
        message = envelope.msg || envelope.message || message;
      }
    } catch {
      // ignore parse error and keep generic message
    }
    throw new FeishuAuthError(message, 502);
  }

  const payload = await response.json();
  return parseFeishuEnvelope<T>(payload);
};

const getAppAccessToken = async () => {
  const { appId, appSecret } = getConfig();
  if (!appId || !appSecret) {
    throw new FeishuAuthError('飞书登录未配置完成，请联系管理员补充应用参数', 503);
  }

  const payload = await requestJson<{ app_access_token?: string; tenant_access_token?: string }>(
    '/open-apis/auth/v3/app_access_token/internal',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        app_id: appId,
        app_secret: appSecret,
      }),
    }
  );

  const token = payload.app_access_token || payload.tenant_access_token;
  if (!token) {
    throw new FeishuAuthError('飞书应用令牌获取失败', 502);
  }

  return token;
};

const exchangeCodeForAccessToken = async (code: string, appAccessToken: string) => {
  const candidates = [
    '/open-apis/authen/v1/access_token',
    '/open-apis/authen/v1/oidc/access_token',
  ];

  let lastError: FeishuAuthError | null = null;

  for (const path of candidates) {
    try {
      const payload = await requestJson<FeishuTokenResponse>(
        path,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${appAccessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            grant_type: 'authorization_code',
            code,
          }),
        },
        {
          fallbackErrors: [404],
        }
      );

      if (payload.access_token) {
        return payload.access_token;
      }

      throw new FeishuAuthError('飞书用户令牌响应缺少 access_token', 502);
    } catch (error) {
      if (error instanceof FeishuAuthError && error.message.startsWith('__fallback__:')) {
        lastError = error;
        continue;
      }
      lastError = error as FeishuAuthError;
    }
  }

  if (lastError) {
    throw lastError;
  }

  throw new FeishuAuthError('飞书用户令牌获取失败', 502);
};

const getUserInfo = async (accessToken: string) => {
  const candidates = [
    '/open-apis/authen/v1/user_info',
    '/open-apis/authen/v1/userinfo',
  ];

  let lastError: FeishuAuthError | null = null;

  for (const path of candidates) {
    try {
      return await requestJson<FeishuUserInfo>(
        path,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
        {
          fallbackErrors: [404],
        }
      );
    } catch (error) {
      if (error instanceof FeishuAuthError && error.message.startsWith('__fallback__:')) {
        lastError = error;
        continue;
      }
      lastError = error as FeishuAuthError;
    }
  }

  if (lastError) {
    throw lastError;
  }

  throw new FeishuAuthError('飞书用户信息获取失败', 502);
};

export const isFeishuAuthEnabled = () => {
  const { appId, appSecret, redirectUri } = getConfig();
  return Boolean(appId && appSecret && redirectUri);
};

export const getFeishuAuthorizeUrl = (state?: string) => {
  const { appId, redirectUri, scope } = getConfig();
  if (!isFeishuAuthEnabled()) {
    throw new FeishuAuthError('飞书登录未启用，请先配置 FEISHU_APP_ID、FEISHU_APP_SECRET 和 FEISHU_REDIRECT_URI', 503);
  }

  const params = new URLSearchParams({
    app_id: appId,
    redirect_uri: redirectUri,
  });

  if (state) {
    params.set('state', state);
  }

  if (scope) {
    params.set('scope', scope);
  }

  return `${FEISHU_BASE_URL}/open-apis/authen/v1/authorize?${params.toString()}`;
};

export const fetchFeishuUserInfoByCode = async (code: string) => {
  if (!code?.trim()) {
    throw new FeishuAuthError('缺少飞书登录 code', 400);
  }

  if (!isFeishuAuthEnabled()) {
    throw new FeishuAuthError('飞书登录未启用，请联系管理员完成配置', 503);
  }

  const appAccessToken = await getAppAccessToken();
  const userAccessToken = await exchangeCodeForAccessToken(code.trim(), appAccessToken);
  const userInfo = await getUserInfo(userAccessToken);

  if (!userInfo.mobile) {
    throw new FeishuAuthError('飞书账号未返回手机号，请检查应用权限或用户资料', 403);
  }

  return userInfo;
};

export { FeishuAuthError };
