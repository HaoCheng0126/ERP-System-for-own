import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Edit, Save, Trash2, Users, X } from 'lucide-react';
import ActionableEmptyState from '../components/ActionableEmptyState';
import QueryStateBanner from '../components/QueryStateBanner';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import api from '../utils/api';
import { Customer, CustomerType } from '../types';

const Customers: React.FC = () => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [newCustomer, setNewCustomer] = useState<Omit<Customer, 'id' | 'code' | 'isActive' | 'createdAt' | 'updatedAt'>>({
    name: '',
    address: '',
    contactPerson: '',
    phone: '',
    group: '',
    type: CustomerType.CLIENT,
  });
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [newGroupName, setNewGroupName] = useState<string>('');
  const [showNewGroupInput, setShowNewGroupInput] = useState(false);

  const queryClient = useQueryClient();

  const { data: customers, isLoading, error, refetch } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const response = await api.get('/customers');
      return response.data;
    },
  });

  const groups = Array.from(new Set(customers?.map((c: Customer) => c.group).filter(Boolean))) as string[];

  const filteredCustomers = customers?.filter((customer: Customer) => {
    const groupMatch = selectedGroup === 'all' || customer.group === selectedGroup;
    const typeMatch = selectedType === 'all' || customer.type === selectedType;
    return groupMatch && typeMatch;
  });

  const addCustomerMutation = useMutation({
    mutationFn: async (customer: typeof newCustomer) => {
      const response = await api.post('/customers', customer);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setShowAddModal(false);
      setNewCustomer({
        name: '',
        address: '',
        contactPerson: '',
        phone: '',
        group: '',
        type: CustomerType.CLIENT,
      });
      setShowNewGroupInput(false);
      setNewGroupName('');
    },
  });

  const updateCustomerMutation = useMutation({
    mutationFn: async (customer: Customer) => {
      const response = await api.put(`/customers/${customer.id}`, customer);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setEditingCustomer(null);
    },
  });

  const deleteCustomerMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await api.delete(`/customers/${id}`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });

  const handleAddCustomer = () => {
    if (!newCustomer.name) {
      alert('请输入客户/供应商名称');
      return;
    }
    const customerToAdd = { ...newCustomer };
    if (showNewGroupInput && newGroupName) {
      customerToAdd.group = newGroupName;
    }
    addCustomerMutation.mutate(customerToAdd);
  };

  const handleUpdateCustomer = () => {
    if (editingCustomer) {
      updateCustomerMutation.mutate(editingCustomer);
    }
  };

  const handleDeleteCustomer = (id: string) => {
    if (window.confirm('确定要删除这个客户/供应商吗？')) {
      deleteCustomerMutation.mutate(id);
    }
  };

  const typeLabels = {
    [CustomerType.CLIENT]: '客户',
    [CustomerType.SUPPLIER]: '供应商',
  };

  return (
    <Layout>
      <PageHeader 
        title="客户管理" 
        subtitle="管理您的客户和供应商信息" 
        action={{ label: '添加客户/供应商', onClick: () => setShowAddModal(true) }}
      />
      
      <div className="p-8">
        <QueryStateBanner
          isLoading={isLoading}
          isError={Boolean(error)}
          loadingText="正在同步客户资料..."
          errorText="客户资料暂时无法同步，请确认后端服务已启动。"
          onRetry={() => refetch()}
        />
        <div className="mb-4 flex items-center space-x-4 flex-wrap gap-2">
          <label className="text-sm font-medium text-gray-700">类型筛选:</label>
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="pl-3 pr-10 py-2 text-sm border border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 rounded-md"
          >
            <option value="all">全部</option>
            <option value={CustomerType.CLIENT}>客户</option>
            <option value={CustomerType.SUPPLIER}>供应商</option>
          </select>
          
          <label className="text-sm font-medium text-gray-700 ml-4">分组筛选:</label>
          <select
            value={selectedGroup}
            onChange={(e) => setSelectedGroup(e.target.value)}
            className="pl-3 pr-10 py-2 text-sm border border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 rounded-md"
          >
            <option value="all">全部</option>
            {groups.map((group) => (
              <option key={group} value={group}>{group}</option>
            ))}
          </select>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          {!isLoading && (filteredCustomers || []).length === 0 ? (
            <div className="p-6">
              <ActionableEmptyState
                icon={Users}
                title={customers?.length ? '没有符合筛选条件的往来方' : '先添加第一个客户'}
                description={customers?.length ? '当前筛选下没有客户或供应商，清除筛选后可查看全部往来方。' : '客户资料会用于送货单、客户价格和对账单。先录入一个真实客户，再继续设置送货价格。'}
                actionLabel={customers?.length ? '查看全部' : '添加客户'}
                onAction={() => {
                  if (customers?.length) {
                    setSelectedType('all');
                    setSelectedGroup('all');
                    return;
                  }
                  setShowAddModal(true);
                }}
              />
            </div>
          ) : (filteredCustomers || []).length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-[800px] w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">编码</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">类型</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">名称</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">分组</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">联系人</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">电话</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">地址</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {(filteredCustomers || []).map((customer: Customer) => (
                  <tr key={customer.id}>
                    {editingCustomer?.id === customer.id ? (
                      <>
                        <td className="px-6 py-4 whitespace-nowrap font-medium">{customer.code}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <select
                            value={editingCustomer.type}
                            onChange={(e) => setEditingCustomer({ ...editingCustomer, type: e.target.value as CustomerType })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                          >
                            <option value={CustomerType.CLIENT}>客户</option>
                            <option value={CustomerType.SUPPLIER}>供应商</option>
                          </select>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <input
                            type="text"
                            value={editingCustomer.name}
                            onChange={(e) => setEditingCustomer({ ...editingCustomer, name: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <select
                            value={editingCustomer.group || ''}
                            onChange={(e) => setEditingCustomer({ ...editingCustomer, group: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                          >
                            <option value="">默认</option>
                            {groups.map((group) => (
                              <option key={group} value={group}>{group}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <input
                            type="text"
                            value={editingCustomer.contactPerson}
                            onChange={(e) => setEditingCustomer({ ...editingCustomer, contactPerson: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <input
                            type="text"
                            value={editingCustomer.phone}
                            onChange={(e) => setEditingCustomer({ ...editingCustomer, phone: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <input
                            type="text"
                            value={editingCustomer.address}
                            onChange={(e) => setEditingCustomer({ ...editingCustomer, address: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={handleUpdateCustomer}
                            className="text-green-600 hover:text-green-900 mr-3"
                          >
                            <Save className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => setEditingCustomer(null)}
                            className="text-gray-600 hover:text-gray-900"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-6 py-4 whitespace-nowrap font-medium">{customer.code}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            customer.type === CustomerType.CLIENT 
                              ? 'bg-blue-100 text-blue-800' 
                              : 'bg-purple-100 text-purple-800'
                          }`}>
                            {typeLabels[customer.type]}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">{customer.name}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                            {customer.group || '默认'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">{customer.contactPerson || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap">{customer.phone || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap">{customer.address || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => setEditingCustomer(customer)}
                            className="text-blue-600 hover:text-blue-900 mr-3"
                          >
                            <Edit className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => handleDeleteCustomer(customer.id)}
                            className="text-red-600 hover:text-red-900"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          ) : null}
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">添加客户/供应商</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">类型</label>
                <select
                  value={newCustomer.type}
                  onChange={(e) => setNewCustomer({ ...newCustomer, type: e.target.value as CustomerType })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                >
                  <option value={CustomerType.CLIENT}>客户</option>
                  <option value={CustomerType.SUPPLIER}>供应商</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">名称</label>
                <input
                  type="text"
                  value={newCustomer.name}
                  onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">分组</label>
                {!showNewGroupInput ? (
                  <div className="flex gap-2">
                    <select
                      value={newCustomer.group || ''}
                      onChange={(e) => {
                        if (e.target.value === '__new__') {
                          setShowNewGroupInput(true);
                        } else {
                          setNewCustomer({ ...newCustomer, group: e.target.value });
                        }
                      }}
                      className="mt-1 block flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    >
                      <option value="">默认</option>
                      {groups.map((group) => (
                        <option key={group} value={group}>{group}</option>
                      ))}
                      <option value="__new__">-- 新建分组 --</option>
                    </select>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      placeholder="输入新分组名称"
                      className="mt-1 block flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    />
                    <button
                      onClick={() => {
                        setShowNewGroupInput(false);
                        setNewGroupName('');
                      }}
                      className="mt-1 px-3 py-2 text-sm text-gray-600 hover:text-gray-800"
                    >
                      取消
                    </button>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">联系人</label>
                <input
                  type="text"
                  value={newCustomer.contactPerson}
                  onChange={(e) => setNewCustomer({ ...newCustomer, contactPerson: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">电话</label>
                <input
                  type="text"
                  value={newCustomer.phone}
                  onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">地址</label>
                <input
                  type="text"
                  value={newCustomer.address}
                  onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end mt-6">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setShowNewGroupInput(false);
                  setNewGroupName('');
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 mr-3"
              >
                取消
              </button>
              <button
                onClick={handleAddCustomer}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                添加
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default Customers;
