import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Edit2, Eye, EyeOff, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import api from '../utils/api';
import { User, UserRole } from '../types';

type ResetPasswordInput = {
  userId: string;
  userName: string;
  newPassword: string;
};

type DeleteUserInput = {
  userId: string;
  userName: string;
};

const getCurrentUserId = () => {
  try {
    const storedUser = localStorage.getItem('user');
    if (!storedUser) return '';
    return (JSON.parse(storedUser) as Partial<User>).id || '';
  } catch {
    return '';
  }
};

const UserManagement: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [resettingUser, setResettingUser] = useState<User | null>(null);
  const [resetPassword, setResetPassword] = useState('123456');
  const [isResetPasswordVisible, setIsResetPasswordVisible] = useState(false);
  const [visibleDefaultPasswordIds, setVisibleDefaultPasswordIds] = useState<Set<string>>(new Set());
  const [actionNotice, setActionNotice] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    role: UserRole.PIECE_RATE,
    phone: '',
    isActive: true,
  });

  const queryClient = useQueryClient();
  const currentUserId = getCurrentUserId();

  // 获取用户列表
  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: async () => {
      const response = await api.get('/users');
      return response.data;
    },
  });

  // 创建用户
  const createUserMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await api.post('/users', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      handleCloseModal();
    },
    onError: (error: any) => {
      alert(error.response?.data?.message || '创建用户失败');
    }
  });

  // 更新用户
  const updateUserMutation = useMutation({
    mutationFn: async (data: any) => {
      const { id, ...rest } = data;
      const response = await api.put(`/users/${id}`, rest);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      handleCloseModal();
    },
    onError: (error: any) => {
      alert(error.response?.data?.message || '更新用户失败');
    }
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ userId, newPassword }: ResetPasswordInput) => {
      const response = await api.post(`/users/${userId}/reset-password`, { newPassword });
      return response.data;
    },
    onSuccess: (data: { message?: string }, variables) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setVisibleDefaultPasswordIds((current) => {
        const next = new Set(current);
        next.delete(variables.userId);
        return next;
      });
      setActionNotice(`${variables.userName}的${data.message || '密码已重置'}，请通知对方使用新密码登录。`);
      handleCloseResetModal();
    },
    onError: (error: any) => {
      alert(error.response?.data?.message || '重置密码失败');
    }
  });

  const deleteUserMutation = useMutation({
    mutationFn: async ({ userId }: DeleteUserInput) => {
      const response = await api.delete(`/users/${userId}`);
      return response.data;
    },
    onSuccess: (_data: { message?: string }, variables) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setVisibleDefaultPasswordIds((current) => {
        const next = new Set(current);
        next.delete(variables.userId);
        return next;
      });
      setActionNotice(`${variables.userName}已删除。`);
    },
    onError: (error: any) => {
      alert(error.response?.data?.message || '删除用户失败');
    }
  });

  const handleOpenModal = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setFormData({
        name: user.name,
        role: user.role,
        phone: user.phone || '',
        isActive: user.isActive,
      });
    } else {
      setEditingUser(null);
      setFormData({
        name: '',
        role: UserRole.PIECE_RATE,
        phone: '',
        isActive: true,
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingUser(null);
  };

  const handleCloseResetModal = () => {
    setResettingUser(null);
    setResetPassword('123456');
    setIsResetPasswordVisible(false);
  };

  const toggleDefaultPasswordVisibility = (userId: string) => {
    setVisibleDefaultPasswordIds((current) => {
      const next = new Set(current);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingUser) {
      const data = {
        id: editingUser.id,
        name: formData.name,
        role: formData.role,
        phone: formData.phone,
        isActive: formData.isActive,
      };
      updateUserMutation.mutate(data);
    } else {
      if (!formData.name) {
        alert('请填写姓名');
        return;
      }
      createUserMutation.mutate(formData);
    }
  };

  const handleResetPassword = (user: User) => {
    setActionNotice('');
    setResetPassword('123456');
    setIsResetPasswordVisible(false);
    setResettingUser(user);
  };

  const handleDeleteUser = (user: User) => {
    if (user.id === currentUserId) {
      alert('不能删除当前登录账号');
      return;
    }

    const roleLabel = user.role === UserRole.ADMIN ? '管理员' : '计件工人';
    const confirmed = window.confirm(
      `确定要删除${roleLabel}「${user.name}」吗？删除后该账号将无法登录，也不会再出现在用户列表中。`
    );
    if (!confirmed) return;

    setActionNotice('');
    deleteUserMutation.mutate({
      userId: user.id,
      userName: user.name,
    });
  };

  const handleSubmitResetPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resettingUser) return;

    const nextPassword = resetPassword.trim();
    if (nextPassword.length < 6) {
      alert('新密码至少需要6位');
      return;
    }

    resetPasswordMutation.mutate({
      userId: resettingUser.id,
      userName: resettingUser.name,
      newPassword: nextPassword,
    });
  };

  if (isLoading) return <div className="p-4">加载中...</div>;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200">
      <div className="p-6 border-b border-gray-200 flex justify-between items-center">
        <h3 className="text-lg font-medium text-gray-900">用户管理</h3>
        <button
          onClick={() => handleOpenModal()}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          添加用户
        </button>
      </div>

      {actionNotice && (
        <div className="mx-6 mt-4 flex items-center justify-between rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          <span>{actionNotice}</span>
          <button
            type="button"
            onClick={() => setActionNotice('')}
            className="rounded p-1 text-green-600 hover:bg-green-100 hover:text-green-800"
            title="关闭提示"
            aria-label="关闭提示"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-[900px] w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">员工编号</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">姓名</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">员工账号</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">密码</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">角色</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">电话</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {users?.map((user) => {
              const isCurrentUser = user.id === currentUserId;
              const isDeletingThisUser = deleteUserMutation.isPending && deleteUserMutation.variables?.userId === user.id;

              return (
                <tr key={user.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{user.code || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{user.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{user.username}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div className="flex items-center gap-2">
                      <span>
                        {user.passwordStatus === 'default'
                          ? `默认(${visibleDefaultPasswordIds.has(user.id) ? '123456' : '••••••'})`
                          : '已修改'}
                      </span>
                      {user.passwordStatus === 'default' ? (
                        <button
                          type="button"
                          onClick={() => toggleDefaultPasswordVisibility(user.id)}
                          className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                          title={visibleDefaultPasswordIds.has(user.id) ? '隐藏默认密码' : '查看默认密码'}
                          aria-label={visibleDefaultPasswordIds.has(user.id) ? '隐藏默认密码' : '查看默认密码'}
                        >
                          {visibleDefaultPasswordIds.has(user.id) ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled
                          className="cursor-not-allowed rounded p-1 text-gray-300"
                          title="密码已加密，无法查看；可以使用右侧按钮设置新密码"
                          aria-label="已修改密码无法查看"
                        >
                          <EyeOff className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      user.role === UserRole.ADMIN ? 'bg-purple-100 text-purple-800' : 'bg-green-100 text-green-800'
                    }`}>
                      {user.role === UserRole.ADMIN ? '管理员' : '计件工人'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{user.phone || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      user.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {user.isActive ? '正常' : '禁用'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      type="button"
                      onClick={() => handleResetPassword(user)}
                      disabled={resetPasswordMutation.isPending}
                      className="mr-4 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:cursor-not-allowed disabled:text-gray-300"
                      title="为该用户设置新密码"
                    >
                      <RotateCcw className={`h-4 w-4 ${
                        resetPasswordMutation.isPending && resetPasswordMutation.variables?.userId === user.id
                          ? 'animate-spin'
                          : ''
                      }`} />
                      {resetPasswordMutation.isPending && resetPasswordMutation.variables?.userId === user.id
                        ? '重置中'
                        : '重置密码'}
                    </button>
                    <button
                      onClick={() => handleOpenModal(user)}
                      className="text-blue-600 hover:text-blue-900 mr-4"
                      title="编辑"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteUser(user)}
                      disabled={isCurrentUser || deleteUserMutation.isPending}
                      className="inline-flex items-center justify-center rounded-md p-1 text-red-600 transition-colors hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:bg-transparent"
                      title={isCurrentUser ? '不能删除当前登录账号' : '删除用户'}
                      aria-label={isCurrentUser ? '不能删除当前登录账号' : `删除${user.name}`}
                    >
                      <Trash2 className={`h-4 w-4 ${isDeletingThisUser ? 'animate-pulse' : ''}`} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {resettingUser && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center px-4 pb-20 pt-4 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" aria-hidden="true">
              <div className="absolute inset-0 bg-gray-500 opacity-75" onClick={handleCloseResetModal}></div>
            </div>

            <span className="hidden sm:inline-block sm:h-screen sm:align-middle" aria-hidden="true">&#8203;</span>

            <div className="inline-block transform overflow-hidden rounded-lg bg-white text-left align-bottom shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:align-middle">
              <form onSubmit={handleSubmitResetPassword}>
                <div className="bg-white px-4 pb-4 pt-5 sm:p-6">
                  <div className="mb-5 flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-medium leading-6 text-gray-900">重置用户密码</h3>
                      <p className="mt-2 text-sm text-gray-500">
                        为 {resettingUser.name}（{resettingUser.username}）设置新的登录密码。
                      </p>
                    </div>
                    <button type="button" onClick={handleCloseResetModal} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-500">
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  <label className="block text-sm font-medium text-gray-700">新密码</label>
                  <div className="relative mt-1">
                    <input
                      type={isResetPasswordVisible ? 'text' : 'password'}
                      value={resetPassword}
                      onChange={(e) => setResetPassword(e.target.value)}
                      className="block w-full rounded-md border border-gray-300 px-3 py-2 pr-10 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                      autoFocus
                      minLength={6}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setIsResetPasswordVisible((visible) => !visible)}
                      className="absolute inset-y-0 right-0 flex items-center rounded-r-md px-3 text-gray-400 hover:text-gray-600"
                      title={isResetPasswordVisible ? '隐藏密码' : '显示密码'}
                      aria-label={isResetPasswordVisible ? '隐藏密码' : '显示密码'}
                    >
                      {isResetPasswordVisible ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  <p className="mt-2 text-sm text-gray-500">
                    至少 6 位。默认使用 123456，也可以改成一次性的临时密码。
                  </p>
                </div>
                <div className="bg-gray-50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6">
                  <button
                    type="submit"
                    disabled={resetPasswordMutation.isPending}
                    className="inline-flex w-full justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-base font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300 sm:ml-3 sm:w-auto sm:text-sm"
                  >
                    {resetPasswordMutation.isPending ? '重置中...' : '确认重置'}
                  </button>
                  <button
                    type="button"
                    onClick={handleCloseResetModal}
                    disabled={resetPasswordMutation.isPending}
                    className="mt-3 inline-flex w-full justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-base font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-300 sm:ml-3 sm:mt-0 sm:w-auto sm:text-sm"
                  >
                    取消
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" aria-hidden="true">
              <div className="absolute inset-0 bg-gray-500 opacity-75" onClick={handleCloseModal}></div>
            </div>

            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <form onSubmit={handleSubmit}>
                <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg leading-6 font-medium text-gray-900">
                      {editingUser ? '编辑用户' : '添加用户'}
                    </h3>
                    <button type="button" onClick={handleCloseModal} className="text-gray-400 hover:text-gray-500">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">员工编号</label>
                      <input
                        type="text"
                        disabled
                        value={editingUser?.code || '自动生成'}
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-100"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700">员工账号</label>
                      <input
                        type="text"
                        disabled
                        value={editingUser?.username || '保存后生成'}
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-100"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700">姓名</label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        required
                      />
                    </div>

                    {!editingUser && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700">初始密码</label>
                        <input
                          type="text"
                          disabled
                          value="123456"
                          className="mt-1 block w-full rounded-md border border-gray-300 bg-gray-100 px-3 py-2 text-sm text-gray-600 shadow-sm"
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-gray-700">角色</label>
                      <select
                        value={formData.role}
                        onChange={(e) => setFormData({...formData, role: e.target.value as UserRole})}
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      >
                        <option value={UserRole.PIECE_RATE}>计件工人</option>
                        <option value={UserRole.ADMIN}>管理员</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700">电话</label>
                      <input
                        type="text"
                        value={formData.phone}
                        onChange={(e) => setFormData({...formData, phone: e.target.value})}
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      />
                    </div>

                    {editingUser && (
                      <div className="flex items-center">
                        <input
                          id="isActive"
                          type="checkbox"
                          checked={formData.isActive}
                          onChange={(e) => setFormData({...formData, isActive: e.target.checked})}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <label htmlFor="isActive" className="ml-2 block text-sm text-gray-900">
                          账户启用状态
                        </label>
                      </div>
                    )}
                  </div>
                </div>
                <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                  <button
                    type="submit"
                    className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm"
                  >
                    保存
                  </button>
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                  >
                    取消
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
