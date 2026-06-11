import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Lock, User } from 'lucide-react';
import api from '../utils/api';
import { LoginRequest, LoginResponse, User as AppUser } from '../types';
import {
  clearFeishuLoginState,
  createFeishuState,
  getFeishuCallbackCode,
  getFeishuCallbackState,
  getStoredFeishuState,
  isFeishuClient,
  storeFeishuState,
  stripAuthParamsFromUrl,
  wasFeishuLoginAttempted,
} from '../utils/feishu';
import { persistAuthSession } from '../utils/session';

const Login: React.FC = () => {
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFeishuLoading, setIsFeishuLoading] = useState(false);
  const [feishuEnabled, setFeishuEnabled] = useState(false);
  const navigate = useNavigate();

  const handleLoginSuccess = (token: string, user: AppUser) => {
    persistAuthSession(token, user);
    if (user.role === 'piece_rate') {
      navigate('/employee-dashboard');
      return;
    }
    navigate('/');
  };

  const beginFeishuLogin = () => {
    const state = createFeishuState();
    storeFeishuState(state);
    const baseURL = typeof api.defaults.baseURL === 'string' ? api.defaults.baseURL : '/api';
    window.location.href = `${baseURL}/auth/feishu/authorize?state=${encodeURIComponent(state)}`;
  };

  useEffect(() => {
    let disposed = false;

    const loadFeishuStatus = async () => {
      try {
        const response = await api.get('/auth/feishu/status');
        if (!disposed) {
          setFeishuEnabled(Boolean(response.data?.enabled));
        }
      } catch {
        if (!disposed) {
          setFeishuEnabled(false);
        }
      }
    };

    loadFeishuStatus();
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    const code = getFeishuCallbackCode();
    const callbackState = getFeishuCallbackState();
    if (!code) {
      return;
    }

    const storedState = getStoredFeishuState();
    if (callbackState && storedState && callbackState !== storedState) {
      clearFeishuLoginState();
      stripAuthParamsFromUrl();
      setError('飞书登录校验失败，请重新发起登录。');
      return;
    }

    let disposed = false;

    const loginWithFeishu = async () => {
      setError('');
      setIsFeishuLoading(true);

      try {
        const response = await api.post<LoginResponse>('/auth/feishu/login', { code });
        if (disposed) {
          return;
        }
        clearFeishuLoginState();
        stripAuthParamsFromUrl();
        handleLoginSuccess(response.data.token, response.data.user);
      } catch (err: any) {
        if (disposed) {
          return;
        }
        clearFeishuLoginState();
        stripAuthParamsFromUrl();
        setError(err.response?.data?.message || '飞书登录失败，请稍后重试');
      } finally {
        if (!disposed) {
          setIsFeishuLoading(false);
        }
      }
    };

    loginWithFeishu();

    return () => {
      disposed = true;
    };
  }, [navigate]);

  useEffect(() => {
    if (!feishuEnabled) {
      return;
    }

    if (!isFeishuClient()) {
      return;
    }

    if (getFeishuCallbackCode()) {
      return;
    }

    if (wasFeishuLoginAttempted()) {
      return;
    }

    beginFeishuLogin();
  }, [feishuEnabled]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await api.post<LoginResponse>('/auth/login', { account, password } as LoginRequest);
      const { token, user } = response.data;
      handleLoginSuccess(token, user);
    } catch (err: any) {
      if (!err.response) {
        setError('无法连接后端服务，请确认服务已启动后重试。');
      } else {
        setError(err.response?.data?.message || '登录失败，请检查账号和密码');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Kinko</h1>
          <p className="text-gray-500">企业管理系统</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">账号</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                placeholder="请输入账号/员工编号/手机号"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">密码</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                placeholder="请输入密码"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:bg-blue-400 disabled:cursor-not-allowed"
          >
            {isLoading ? '登录中...' : '登录'}
          </button>

          {feishuEnabled && (
            <>
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-gray-200" />
                <span className="text-sm text-gray-400">或</span>
                <div className="h-px flex-1 bg-gray-200" />
              </div>

              <button
                type="button"
                onClick={beginFeishuLogin}
                disabled={isFeishuLoading}
                className="w-full border border-slate-300 text-slate-700 py-3 rounded-lg font-medium hover:bg-slate-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Building2 className="w-5 h-5" />
                {isFeishuLoading ? '飞书登录中...' : '使用飞书登录'}
              </button>
            </>
          )}
        </form>
      </div>
    </div>
  );
};

export default Login;
