import React, { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import api from '../utils/api';
import { User, UserRole } from '../types';

const EmployeeSystem: React.FC = () => {
  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);

  const { data: user, isLoading } = useQuery<User>({
    queryKey: ['currentUser'],
    queryFn: async () => {
      const response = await api.get('/auth/me');
      return response.data;
    },
  });

  useEffect(() => {
    if (user) {
      setProfileUser(user);
      setProfileName(user.name || '');
      setProfilePhone(user.phone || '');
    }
  }, [user]);

  const resetPasswordFields = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const updateProfileMutation = useMutation({
    mutationFn: async () => {
      const response = await api.put('/auth/profile', {
        name: profileName,
        phone: profilePhone,
      });
      return response.data;
    },
    onSuccess: (data) => {
      setProfileError('');
      setProfileSuccess('资料更新成功');
      if (data?.user) {
        setProfileUser(data.user);
        setProfileName(data.user.name || '');
        setProfilePhone(data.user.phone || '');
        const stored = localStorage.getItem('user');
        if (stored) {
          const merged = { ...JSON.parse(stored), ...data.user };
          localStorage.setItem('user', JSON.stringify(merged));
        } else {
          localStorage.setItem('user', JSON.stringify(data.user));
        }
        window.dispatchEvent(new Event('user-updated'));
      }
    },
    onError: (error: any) => {
      setProfileSuccess('');
      setProfileError(error?.response?.data?.message || '资料更新失败');
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/auth/change-password', {
        currentPassword,
        newPassword,
      });
      return response.data;
    },
    onSuccess: () => {
      resetPasswordFields();
      setErrorMessage('');
      setSuccessMessage('密码修改成功');
      setIsPasswordModalOpen(false);
    },
    onError: (error: any) => {
      setSuccessMessage('');
      setErrorMessage(error?.response?.data?.message || '密码修改失败');
    },
  });

  const openPasswordModal = () => {
    resetPasswordFields();
    setErrorMessage('');
    setSuccessMessage('');
    setIsPasswordModalOpen(true);
  };

  const closePasswordModal = () => {
    if (changePasswordMutation.isPending) {
      return;
    }
    resetPasswordFields();
    setErrorMessage('');
    setIsPasswordModalOpen(false);
  };

  const handlePasswordSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setSuccessMessage('');
    if (!currentPassword || !newPassword || !confirmPassword) {
      setErrorMessage('请填写完整密码信息');
      return;
    }
    if (newPassword.length < 6) {
      setErrorMessage('新密码至少需要6位');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage('两次输入的新密码不一致');
      return;
    }
    setErrorMessage('');
    changePasswordMutation.mutate();
  };

  const handleProfileSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setProfileSuccess('');
    if (!profileName.trim()) {
      setProfileError('姓名不能为空');
      return;
    }
    setProfileError('');
    updateProfileMutation.mutate();
  };

  return (
    <Layout>
      <PageHeader title="个人信息" subtitle="查看和维护账号资料" />
      <div className="p-8 space-y-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <form className="p-6" onSubmit={handleProfileSubmit}>
            <h3 className="text-lg font-medium text-gray-900 mb-4">账号信息</h3>
            {isLoading ? (
              <div className="text-gray-500 text-sm">加载中...</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-700">
                <div>
                  <div className="text-gray-500 mb-1">姓名</div>
                  <input
                    type="text"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  />
                </div>
                <div>
                  <div className="text-gray-500 mb-1">账号</div>
                  <div className="mt-1 text-gray-900">{profileUser?.username || '-'}</div>
                </div>
                <div>
                  <div className="text-gray-500 mb-1">工号</div>
                  <div className="text-gray-900">{profileUser?.code || '-'}</div>
                </div>
                <div>
                  <div className="text-gray-500 mb-1">角色</div>
                  <div className="text-gray-900">{profileUser?.role === UserRole.ADMIN ? '管理员' : '计件工人'}</div>
                </div>
                <div>
                  <div className="text-gray-500 mb-1">联系电话</div>
                  <input
                    type="text"
                    value={profilePhone}
                    onChange={(e) => setProfilePhone(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  />
                </div>
              </div>
            )}
            {!isLoading && (
              <div className="mt-4">
                {profileError && (
                  <div className="text-sm text-red-500">{profileError}</div>
                )}
                {profileSuccess && (
                  <div className="text-sm text-green-600">{profileSuccess}</div>
                )}
                <div className="flex justify-end mt-4">
                  <button
                    type="submit"
                    disabled={updateProfileMutation.isPending}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60"
                  >
                    {updateProfileMutation.isPending ? '保存中...' : '保存资料'}
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-lg font-medium text-gray-900">账号安全</h3>
              <p className="mt-1 text-sm text-gray-500">修改当前账号登录密码，需要先验证原密码。</p>
              {successMessage && (
                <div className="mt-3 text-sm text-green-600">{successMessage}</div>
              )}
            </div>
            <button
              type="button"
              onClick={openPasswordModal}
              className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
            >
              修改密码
            </button>
          </div>
        </div>
      </div>

      {isPasswordModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 px-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
            <div className="flex items-start justify-between border-b border-gray-200 px-6 py-5">
              <div>
                <h3 className="text-xl font-semibold text-gray-900">修改密码</h3>
                <p className="mt-1 text-sm text-gray-500">
                  {profileUser?.name || '当前用户'} · {profileUser?.role === UserRole.ADMIN ? '管理员' : '计件工人'}
                </p>
              </div>
              <button
                type="button"
                onClick={closePasswordModal}
                disabled={changePasswordMutation.isPending}
                aria-label="关闭修改密码弹窗"
                className="text-3xl leading-none text-gray-400 hover:text-gray-600 disabled:opacity-50"
              >
                ×
              </button>
            </div>
            <form onSubmit={handlePasswordSubmit}>
              <div className="space-y-4 px-6 py-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700">原密码</label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    autoComplete="current-password"
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">新密码</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                    minLength={6}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">确认新密码</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    minLength={6}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  />
                </div>
                {errorMessage && (
                  <div className="text-sm text-red-500">{errorMessage}</div>
                )}
              </div>
              <div className="flex justify-end gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4 rounded-b-xl">
                <button
                  type="button"
                  onClick={closePasswordModal}
                  disabled={changePasswordMutation.isPending}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-60"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={changePasswordMutation.isPending}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60"
                >
                  {changePasswordMutation.isPending ? '提交中...' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default EmployeeSystem;
