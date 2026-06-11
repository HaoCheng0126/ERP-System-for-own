const FEISHU_STATE_KEY = 'feishu_auth_state';
const FEISHU_ATTEMPTED_KEY = 'feishu_auth_attempted';

const FEISHU_UA_PATTERN = /(feishu|lark)/i;

export const isFeishuClient = () => FEISHU_UA_PATTERN.test(window.navigator.userAgent || '');

export const getFeishuCallbackCode = () => {
  const params = new URLSearchParams(window.location.search);
  return (
    params.get('code') ||
    params.get('tmp_auth_code') ||
    params.get('authCode') ||
    ''
  );
};

export const getFeishuCallbackState = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get('state') || '';
};

export const storeFeishuState = (state: string) => {
  sessionStorage.setItem(FEISHU_STATE_KEY, state);
  sessionStorage.setItem(FEISHU_ATTEMPTED_KEY, '1');
};

export const getStoredFeishuState = () => sessionStorage.getItem(FEISHU_STATE_KEY) || '';

export const wasFeishuLoginAttempted = () => sessionStorage.getItem(FEISHU_ATTEMPTED_KEY) === '1';

export const clearFeishuLoginState = () => {
  sessionStorage.removeItem(FEISHU_STATE_KEY);
  sessionStorage.removeItem(FEISHU_ATTEMPTED_KEY);
};

export const createFeishuState = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

export const stripAuthParamsFromUrl = () => {
  const current = new URL(window.location.href);
  ['code', 'tmp_auth_code', 'authCode', 'state'].forEach((key) => current.searchParams.delete(key));
  window.history.replaceState({}, document.title, current.pathname + current.search + current.hash);
};
