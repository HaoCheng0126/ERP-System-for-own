import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Save } from 'lucide-react';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import QueryStateBanner from '../components/QueryStateBanner';
import api from '../utils/api';
import { Company } from '../types';
import UserManagement from './UserManagement';

const Settings: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') === 'users' ? 'users' : 'company';
  const [activeTab, setActiveTab] = useState<'company' | 'users'>(initialTab);
  const [isEditing, setIsEditing] = useState(false);
  const [companyData, setCompanyData] = useState<Company>({
    id: '',
    name: '',
    address: '',
    contactPerson: '',
    phone: '',
    statementTaxLabel: '',
    statementSettlementLabel: '',
    createdAt: '',
    updatedAt: '',
  });

  const queryClient = useQueryClient();

  // 获取公司信息
  const { data: company, isLoading, error, refetch } = useQuery<Company>({
    queryKey: ['company'],
    queryFn: async () => {
      const response = await api.get('/company');
      return response.data;
    },
    staleTime: 5 * 60 * 1000, // 5分钟
  });

  // 当公司数据更新时，更新表单数据
  React.useEffect(() => {
    if (company) {
      setCompanyData(company);
    }
  }, [company]);

  // 更新公司信息
  const updateCompanyMutation = useMutation({
    mutationFn: async (data: Company) => {
      const response = await api.put('/company', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company'] });
      setIsEditing(false);
    },
  });

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    if (company) {
      setCompanyData(company);
    }
  };

  const handleSave = () => {
    updateCompanyMutation.mutate(companyData);
  };

  const handleTabChange = (tab: 'company' | 'users') => {
    setActiveTab(tab);
    setSearchParams(tab === 'users' ? { tab: 'users' } : {});
  };

  return (
    <Layout>
      <PageHeader 
        title="系统设置" 
        subtitle="管理系统和公司信息" 
      />
      
      <div className="p-8">
        <QueryStateBanner
          isLoading={isLoading}
          isError={Boolean(error)}
          loadingText="正在同步系统设置..."
          errorText="系统设置暂时无法同步，请确认后端服务已启动。"
          onRetry={() => refetch()}
        />
        <div className="mb-6 border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => handleTabChange('company')}
              className={`${
                activeTab === 'company'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              公司信息
            </button>
            <button
              onClick={() => handleTabChange('users')}
              className={`${
                activeTab === 'users'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              用户管理
            </button>
          </nav>
        </div>

        {activeTab === 'users' ? (
          <UserManagement />
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-medium text-gray-900">公司信息</h3>
              {!isEditing && (
                <button
                  onClick={handleEdit}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  编辑
                </button>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">公司名称</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={companyData.name}
                    onChange={(e) => setCompanyData({ ...companyData, name: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  />
                ) : (
                  <div className="mt-1 text-sm text-gray-900">{companyData.name}</div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">联系人</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={companyData.contactPerson || ''}
                    onChange={(e) => setCompanyData({ ...companyData, contactPerson: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  />
                ) : (
                  <div className="mt-1 text-sm text-gray-900">{companyData.contactPerson || '-'}</div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">电话</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={companyData.phone || ''}
                    onChange={(e) => setCompanyData({ ...companyData, phone: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  />
                ) : (
                  <div className="mt-1 text-sm text-gray-900">{companyData.phone || '-'}</div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">地址</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={companyData.address || ''}
                    onChange={(e) => setCompanyData({ ...companyData, address: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  />
                ) : (
                  <div className="mt-1 text-sm text-gray-900">{companyData.address || '-'}</div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">税率</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={companyData.statementTaxLabel || ''}
                    onChange={(e) => setCompanyData({ ...companyData, statementTaxLabel: e.target.value })}
                    placeholder="例如：不含税"
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  />
                ) : (
                  <div className="mt-1 text-sm text-gray-900">{companyData.statementTaxLabel || '-'}</div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">结款模式</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={companyData.statementSettlementLabel || ''}
                    onChange={(e) => setCompanyData({ ...companyData, statementSettlementLabel: e.target.value })}
                    placeholder="例如：月结30天"
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  />
                ) : (
                  <div className="mt-1 text-sm text-gray-900">{companyData.statementSettlementLabel || '-'}</div>
                )}
              </div>
            </div>

            {isEditing && (
              <div className="flex justify-end mt-6">
                <button
                  onClick={handleCancel}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 mr-3"
                >
                  取消
                </button>
                <button
                  onClick={handleSave}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  <Save className="w-4 h-4 mr-2" />
                  保存
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  </Layout>
);
};

export default Settings;
