import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Edit, Save, Trash2, Users, X } from 'lucide-react';
import ActionableEmptyState from '../components/ActionableEmptyState';
import FilterPanel, { ActiveFilter, FilterField, SearchInput } from '../components/FilterPanel';
import QueryStateBanner from '../components/QueryStateBanner';
import Layout from '../components/Layout';
import { MobileActionBar, MobileField, MobileFieldGrid, MobileRecordCard } from '../components/MobileRecordCard';
import PageHeader from '../components/PageHeader';
import api from '../utils/api';
import { formatAmount } from '../utils/format';
import { isNonZeroAmount, matchesKeyword } from '../utils/filtering';
import useDebouncedValue from '../hooks/useDebouncedValue';
import { Customer, CustomerType } from '../types';
import { useCounterparties } from '../hooks/useCounterparties';

type BalanceFilter = 'all' | 'hasBalance' | 'noBalance';

const Customers: React.FC = () => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [newCustomer, setNewCustomer] = useState<Omit<Customer, 'id' | 'code' | 'isActive' | 'createdAt' | 'updatedAt'>>({
    name: '',
    address: '',
    contactPerson: '',
    phone: '',
    initialBalance: 0,
    group: '',
    type: CustomerType.CLIENT,
  });
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [balanceFilter, setBalanceFilter] = useState<BalanceFilter>('all');
  const [newGroupName, setNewGroupName] = useState<string>('');
  const [showNewGroupInput, setShowNewGroupInput] = useState(false);
  const debouncedSearchTerm = useDebouncedValue(searchTerm);

  const queryClient = useQueryClient();

  const { data: customers, isLoading, error, refetch } = useCounterparties();

  const groups = Array.from(new Set(customers?.map((c: Customer) => c.group).filter(Boolean))) as string[];

  const filteredCustomers = customers?.filter((customer: Customer) => {
    const groupMatch = selectedGroup === 'all' || customer.group === selectedGroup;
    const typeMatch = selectedType === 'all' || customer.type === selectedType;
    const balanceValue = Number(customer.initialBalance || 0);
    const balanceMatch =
      balanceFilter === 'all' ||
      (balanceFilter === 'hasBalance' && isNonZeroAmount(balanceValue)) ||
      (balanceFilter === 'noBalance' && !isNonZeroAmount(balanceValue));
    const keywordMatch = matchesKeyword(debouncedSearchTerm, [
      customer.code,
      customer.name,
      customer.contactPerson,
      customer.phone,
      customer.address,
      customer.group,
    ]);
    return groupMatch && typeMatch && balanceMatch && keywordMatch;
  });

  const clearFilters = () => {
    setSelectedType('all');
    setSelectedGroup('all');
    setSearchTerm('');
    setBalanceFilter('all');
  };

  const activeFilters: ActiveFilter[] = [
    searchTerm
      ? {
          key: 'keyword',
          label: `关键词: ${searchTerm}`,
          onRemove: () => setSearchTerm(''),
        }
      : null,
    selectedType !== 'all'
      ? {
          key: 'type',
          label: `类型: ${selectedType === CustomerType.CLIENT ? '客户' : '供应商'}`,
          onRemove: () => setSelectedType('all'),
        }
      : null,
    selectedGroup !== 'all'
      ? {
          key: 'group',
          label: `分组: ${selectedGroup}`,
          onRemove: () => setSelectedGroup('all'),
        }
      : null,
    balanceFilter !== 'all'
      ? {
          key: 'balance',
          label: `结余: ${balanceFilter === 'hasBalance' ? '有结余' : '无结余'}`,
          onRemove: () => setBalanceFilter('all'),
        }
      : null,
  ].filter((item): item is ActiveFilter => Boolean(item));

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
        initialBalance: 0,
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
      
      <div className="px-4 pb-4 pt-0 md:px-6 md:pb-6">
        <QueryStateBanner
          isLoading={isLoading}
          isError={Boolean(error)}
          loadingText="正在同步客户资料..."
          errorText="客户资料暂时无法同步，请确认后端服务已启动。"
          onRetry={() => refetch()}
        />
        <div className="-mx-4 overflow-hidden border-b border-line bg-white md:-mx-6">
          <FilterPanel
            totalCount={(customers || []).length}
            filteredCount={(filteredCustomers || []).length}
            activeFilters={activeFilters}
            onClear={clearFilters}
            desktopInlineAdvanced
            primary={
              <>
                <FilterField label="关键词" className="lg:w-64">
                  <SearchInput
                    value={searchTerm}
                    onChange={setSearchTerm}
                    placeholder="客户编号、名称、联系人、电话"
                  />
                </FilterField>
                <FilterField label="类型" className="lg:w-40">
                  <select
                    value={selectedType}
                    onChange={(e) => setSelectedType(e.target.value)}
                    className="block min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                  >
                    <option value="all">全部</option>
                    <option value={CustomerType.CLIENT}>客户</option>
                    <option value={CustomerType.SUPPLIER}>供应商</option>
                  </select>
                </FilterField>
              </>
            }
            advanced={
              <>
                <FilterField label="分组" className="lg:w-40">
                  <select
                    value={selectedGroup}
                    onChange={(e) => setSelectedGroup(e.target.value)}
                    className="block min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                  >
                    <option value="all">全部</option>
                    {groups.map((group) => (
                      <option key={group} value={group}>{group}</option>
                    ))}
                  </select>
                </FilterField>
                <FilterField label="结余款项" className="lg:w-40">
                  <select
                    value={balanceFilter}
                    onChange={(e) => setBalanceFilter(e.target.value as BalanceFilter)}
                    className="block min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                  >
                    <option value="all">全部</option>
                    <option value="hasBalance">有结余</option>
                    <option value="noBalance">无结余</option>
                  </select>
                </FilterField>
              </>
            }
          />
          {!isLoading && (filteredCustomers || []).length === 0 ? (
            <div className="p-6">
              <ActionableEmptyState
                icon={Users}
                title={customers?.length ? '没有符合筛选条件的往来方' : '先添加第一个客户'}
                description={customers?.length ? '当前筛选下没有客户或供应商，清除筛选后可查看全部往来方。' : '客户资料会用于送货单、客户价格和对账单。先录入一个真实客户，再继续设置送货价格。'}
                actionLabel={customers?.length ? '查看全部' : '添加客户'}
                onAction={() => {
                  if (customers?.length) {
                    clearFilters();
                    return;
                  }
                  setShowAddModal(true);
                }}
              />
            </div>
          ) : (filteredCustomers || []).length > 0 ? (
          <>
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-[800px] w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">编码</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">类型</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">名称</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">分组</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">联系人</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">电话</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">结余款项</th>
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
                            type="number"
                            step="0.01"
                            value={editingCustomer.initialBalance ?? 0}
                            onChange={(e) => setEditingCustomer({ ...editingCustomer, initialBalance: Number(e.target.value || 0) })}
                            className="w-32 px-3 py-2 text-right border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
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
                        <td className="px-6 py-4 whitespace-nowrap text-right font-medium text-gray-900">¥{formatAmount(customer.initialBalance || 0)}</td>
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
          <div className="space-y-3 p-4 md:hidden">
            {(filteredCustomers || []).map((customer: Customer) => (
              <MobileRecordCard key={customer.id}>
                {editingCustomer?.id === customer.id ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 gap-3">
                      <input
                        type="text"
                        value={editingCustomer.name}
                        onChange={(e) => setEditingCustomer({ ...editingCustomer, name: e.target.value })}
                        className="min-h-11 rounded-md border border-gray-300 px-3 py-2 text-sm"
                        placeholder="名称"
                      />
                      <select
                        value={editingCustomer.type}
                        onChange={(e) => setEditingCustomer({ ...editingCustomer, type: e.target.value as CustomerType })}
                        className="min-h-11 rounded-md border border-gray-300 px-3 py-2 text-sm"
                      >
                        <option value={CustomerType.CLIENT}>客户</option>
                        <option value={CustomerType.SUPPLIER}>供应商</option>
                      </select>
                      <input
                        type="text"
                        value={editingCustomer.contactPerson}
                        onChange={(e) => setEditingCustomer({ ...editingCustomer, contactPerson: e.target.value })}
                        className="min-h-11 rounded-md border border-gray-300 px-3 py-2 text-sm"
                        placeholder="联系人"
                      />
                      <input
                        type="text"
                        value={editingCustomer.phone}
                        onChange={(e) => setEditingCustomer({ ...editingCustomer, phone: e.target.value })}
                        className="min-h-11 rounded-md border border-gray-300 px-3 py-2 text-sm"
                        placeholder="电话"
                      />
                      <input
                        type="number"
                        step="0.01"
                        value={editingCustomer.initialBalance ?? 0}
                        onChange={(e) => setEditingCustomer({ ...editingCustomer, initialBalance: Number(e.target.value || 0) })}
                        className="min-h-11 rounded-md border border-gray-300 px-3 py-2 text-right text-sm"
                        placeholder="结余款项"
                      />
                      <input
                        type="text"
                        value={editingCustomer.address}
                        onChange={(e) => setEditingCustomer({ ...editingCustomer, address: e.target.value })}
                        className="min-h-11 rounded-md border border-gray-300 px-3 py-2 text-sm"
                        placeholder="地址"
                      />
                    </div>
                    <MobileActionBar>
                      <button
                        onClick={handleUpdateCustomer}
                        className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-green-100 px-3 py-2 text-sm font-medium text-green-700 hover:bg-green-50"
                      >
                        <Save className="h-4 w-4" />
                        保存
                      </button>
                      <button
                        onClick={() => setEditingCustomer(null)}
                        className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                      >
                        <X className="h-4 w-4" />
                        取消
                      </button>
                    </MobileActionBar>
                  </div>
                ) : (
                  <>
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-base font-semibold text-gray-900">{customer.name}</div>
                        <div className="mt-1 text-sm text-gray-500">{customer.code} · {customer.group || '默认'}</div>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${
                        customer.type === CustomerType.CLIENT ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                      }`}>
                        {typeLabels[customer.type]}
                      </span>
                    </div>
                    <MobileFieldGrid>
                      <MobileField label="联系人" value={customer.contactPerson || '-'} />
                      <MobileField label="电话" value={customer.phone || '-'} align="right" />
                      <MobileField label="结余款项" value={`¥${formatAmount(customer.initialBalance || 0)}`} />
                      <MobileField label="地址" value={customer.address || '-'} align="right" />
                    </MobileFieldGrid>
                    <MobileActionBar>
                      <button
                        onClick={() => setEditingCustomer(customer)}
                        className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-blue-100 px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50"
                      >
                        <Edit className="h-4 w-4" />
                        编辑
                      </button>
                      <button
                        onClick={() => handleDeleteCustomer(customer.id)}
                        className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-100 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                        删除
                      </button>
                    </MobileActionBar>
                  </>
                )}
              </MobileRecordCard>
            ))}
          </div>
          </>
          ) : null}
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-gray-600 bg-opacity-50 sm:items-center sm:p-4">
          <div className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border bg-white p-5 shadow-lg sm:max-w-md sm:rounded-lg">
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
                <label className="block text-sm font-medium text-gray-700">结余款项</label>
                <input
                  type="number"
                  step="0.01"
                  value={newCustomer.initialBalance ?? 0}
                  onChange={(e) => setNewCustomer({ ...newCustomer, initialBalance: Number(e.target.value || 0) })}
                  className="mt-1 block w-full px-3 py-2 text-right border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
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
