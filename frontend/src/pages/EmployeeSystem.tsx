import React, { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  ClipboardList,
  Eye,
  EyeOff,
  KeyRound,
  Save,
  Wallet,
  XCircle,
} from 'lucide-react';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import api from '../utils/api';
import { formatAmount } from '../utils/format';
import { User, UserRole } from '../types';

interface EmployeeStats {
  pendingCount: number;
  rejectedCount: number;
  approvedMonthCount: number;
  currentMonthWage: number;
  lastMonthWage: number;
  wageChangePercentage: number;
}

const EmployeeSystem: React.FC = () => {
  const navigate = useNavigate();
  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
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

  const isAdmin = user?.role === UserRole.ADMIN;
  const isPieceRate = Boolean(user) && !isAdmin;

  const { data: stats } = useQuery<EmployeeStats>({
    queryKey: ['employeeStats'],
    queryFn: async () => (await api.get('/dashboard/employee-stats')).data,
    enabled: isPieceRate,
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
    setShowCurrent(false);
    setShowNew(false);
  };

  const updateProfileMutation = useMutation({
    mutationFn: async () => {
      const response = await api.put('/auth/profile', { name: profileName, phone: profilePhone });
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
        const merged = stored ? { ...JSON.parse(stored), ...data.user } : data.user;
        localStorage.setItem('user', JSON.stringify(merged));
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
      const response = await api.post('/auth/change-password', { currentPassword, newPassword });
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
    if (changePasswordMutation.isPending) return;
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

  const roleLabel = isAdmin ? '管理员' : '计件工人';
  const joinedAt = profileUser?.createdAt ? profileUser.createdAt.slice(0, 10) : '-';

  const statTiles = [
    {
      key: 'wage',
      label: '本月工资',
      value: `¥${formatAmount(stats?.currentMonthWage)}`,
      icon: Wallet,
      tone: 'text-ink',
      delta: stats?.wageChangePercentage,
    },
    { key: 'count', label: '本月入库单', value: String(stats?.approvedMonthCount ?? 0), icon: ClipboardList, tone: 'text-ink' },
    { key: 'pending', label: '待审核', value: String(stats?.pendingCount ?? 0), icon: AlertCircle, tone: 'text-amber-600' },
    { key: 'rejected', label: '已驳回', value: String(stats?.rejectedCount ?? 0), icon: XCircle, tone: 'text-rose-600' },
  ];

  const inputClass =
    'mt-1 block w-full rounded-lg border border-line px-3 py-2 text-sm text-ink shadow-sm transition-colors focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';

  return (
    <Layout>
      <PageHeader title="个人信息" />

      <div className="space-y-4 px-4 pb-6 pt-0 md:px-6">
        {/* 身份卡 + 可编辑资料 */}
        <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
          <div className="flex flex-col gap-4 border-b border-line p-5 sm:flex-row sm:items-center">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-[#7AA0FF] text-xl font-semibold text-white shadow-sm">
              {(profileUser?.name || 'U').slice(0, 1)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-lg font-semibold text-ink">{profileUser?.name || '-'}</h2>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    isAdmin ? 'bg-purple-100 text-purple-700' : 'bg-emerald-50 text-emerald-700'
                  }`}
                >
                  {roleLabel}
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    profileUser?.isActive === false ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-700'
                  }`}
                >
                  {profileUser?.isActive === false ? '已停用' : '正常'}
                </span>
              </div>
              <p className="mt-1 text-xs text-ink-tertiary">
                工号 {profileUser?.code || '-'} · 账号 {profileUser?.username || '-'} · 加入 {joinedAt}
              </p>
            </div>
          </div>

          <form className="p-5" onSubmit={handleProfileSubmit}>
            <h3 className="mb-3 text-sm font-medium text-ink-secondary">编辑资料</h3>
            {isLoading ? (
              <div className="text-sm text-ink-tertiary">加载中...</div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-ink-secondary">姓名</label>
                    <input type="text" value={profileName} onChange={(e) => setProfileName(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-ink-secondary">联系电话</label>
                    <input type="text" value={profilePhone} onChange={(e) => setProfilePhone(e.target.value)} className={inputClass} />
                  </div>
                </div>
                <p className="mt-2 text-xs text-ink-tertiary">账号、工号、角色由管理员维护，如需调整请联系管理员。</p>

                {profileError && <div className="mt-3 text-sm text-rose-600">{profileError}</div>}
                {profileSuccess && (
                  <div className="mt-3 inline-flex items-center gap-1.5 text-sm text-emerald-600">
                    <CheckCircle2 className="h-4 w-4" />
                    {profileSuccess}
                  </div>
                )}

                <div className="mt-4 flex justify-end">
                  <button
                    type="submit"
                    disabled={updateProfileMutation.isPending}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700 disabled:opacity-60"
                  >
                    <Save className="h-4 w-4" />
                    {updateProfileMutation.isPending ? '保存中...' : '保存资料'}
                  </button>
                </div>
              </>
            )}
          </form>
        </div>

        {/* 我的本月（计件工人） */}
        {isPieceRate && (
          <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h3 className="text-base font-semibold text-ink">我的本月</h3>
              <button
                type="button"
                onClick={() => navigate('/employee-dashboard')}
                className="text-sm font-medium text-brand-600 hover:underline"
              >
                查看明细 ›
              </button>
            </div>
            <div className="grid grid-cols-2 divide-x divide-y divide-line-soft sm:grid-cols-4 sm:divide-y-0">
              {statTiles.map((tile) => {
                const Icon = tile.icon;
                return (
                  <div key={tile.key} className="p-4">
                    <div className="flex items-center gap-1.5 text-xs text-ink-tertiary">
                      <Icon className="h-3.5 w-3.5" />
                      {tile.label}
                    </div>
                    <div className={`mt-1.5 text-xl font-bold tabular-nums ${tile.tone}`}>{tile.value}</div>
                    {tile.delta !== undefined && (
                      <div className="mt-1">
                        {tile.delta ? (
                          <span
                            className={`inline-flex items-center gap-0.5 text-xs font-medium ${
                              tile.delta > 0 ? 'text-emerald-600' : 'text-rose-600'
                            }`}
                          >
                            {tile.delta > 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                            {Math.abs(tile.delta).toFixed(1)}% 环比
                          </span>
                        ) : (
                          <span className="text-xs text-ink-tertiary">环比持平</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 账号安全 */}
        <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <KeyRound className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-base font-semibold text-ink">账号安全</h3>
                <p className="mt-0.5 text-sm text-ink-tertiary">修改登录密码需先验证原密码，新密码至少 6 位。</p>
                {successMessage && (
                  <div className="mt-2 inline-flex items-center gap-1.5 text-sm text-emerald-600">
                    <CheckCircle2 className="h-4 w-4" />
                    {successMessage}
                  </div>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={openPasswordModal}
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-line bg-white px-4 py-2 text-sm font-medium text-ink-secondary shadow-sm transition-colors hover:border-brand-200 hover:bg-brand-50 hover:text-brand-600"
            >
              <KeyRound className="h-4 w-4" />
              修改密码
            </button>
          </div>
        </div>
      </div>

      {isPasswordModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/50 sm:items-center sm:px-4">
          <div className="w-full overflow-hidden rounded-t-2xl bg-white shadow-pop sm:max-w-lg sm:rounded-2xl">
            <div className="flex items-start justify-between border-b border-line px-6 py-5">
              <div>
                <h3 className="text-lg font-semibold text-ink">修改密码</h3>
                <p className="mt-1 text-sm text-ink-tertiary">
                  {profileUser?.name || '当前用户'} · {roleLabel}
                </p>
              </div>
              <button
                type="button"
                onClick={closePasswordModal}
                disabled={changePasswordMutation.isPending}
                aria-label="关闭修改密码弹窗"
                className="rounded-md p-1 text-ink-tertiary transition-colors hover:bg-canvas hover:text-ink disabled:opacity-50"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handlePasswordSubmit}>
              <div className="space-y-4 px-6 py-5">
                <div>
                  <label className="block text-sm font-medium text-ink-secondary">原密码</label>
                  <div className="relative mt-1">
                    <input
                      type={showCurrent ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      autoComplete="current-password"
                      className={`${inputClass} mt-0 pr-10`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrent((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-tertiary hover:text-ink"
                      aria-label={showCurrent ? '隐藏密码' : '显示密码'}
                    >
                      {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink-secondary">新密码</label>
                  <div className="relative mt-1">
                    <input
                      type={showNew ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      autoComplete="new-password"
                      minLength={6}
                      className={`${inputClass} mt-0 pr-10`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNew((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-tertiary hover:text-ink"
                      aria-label={showNew ? '隐藏密码' : '显示密码'}
                    >
                      {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-ink-tertiary">至少 6 位，建议字母与数字组合。</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink-secondary">确认新密码</label>
                  <input
                    type={showNew ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    minLength={6}
                    className={inputClass}
                  />
                </div>
                {errorMessage && <div className="text-sm text-rose-600">{errorMessage}</div>}
              </div>
              <div className="flex justify-end gap-3 border-t border-line bg-canvas px-6 py-4">
                <button
                  type="button"
                  onClick={closePasswordModal}
                  disabled={changePasswordMutation.isPending}
                  className="inline-flex min-h-11 items-center rounded-lg border border-line bg-white px-4 py-2 text-sm font-medium text-ink-secondary shadow-sm transition-colors hover:bg-canvas disabled:opacity-60"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={changePasswordMutation.isPending}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700 disabled:opacity-60"
                >
                  <Save className="h-4 w-4" />
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
