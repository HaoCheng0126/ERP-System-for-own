import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Building2, Pencil, Save } from 'lucide-react';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import QueryStateBanner from '../components/QueryStateBanner';
import api from '../utils/api';
import { Company } from '../types';
import UserManagement from './UserManagement';
import VisionSettings from './VisionSettings';

const inputClass =
  'mt-1 block w-full rounded-lg border border-line px-3 py-2 text-sm text-ink shadow-sm transition-colors focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';

const Settings: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const initialTab: 'company' | 'users' | 'vision' =
    tabParam === 'users' ? 'users' : tabParam === 'vision' ? 'vision' : 'company';
  const [activeTab, setActiveTab] = useState<'company' | 'users' | 'vision'>(initialTab);
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

  const handleTabChange = (tab: 'company' | 'users' | 'vision') => {
    setActiveTab(tab);
    setSearchParams(tab === 'company' ? {} : { tab });
  };

  const companyFields: { label: string; value?: string }[] = [
    { label: '公司名称', value: companyData.name },
    { label: '联系人', value: companyData.contactPerson },
    { label: '电话', value: companyData.phone },
    { label: '地址', value: companyData.address },
    { label: '税率', value: companyData.statementTaxLabel },
    { label: '结款模式', value: companyData.statementSettlementLabel },
  ];

  return (
    <Layout>
      <PageHeader title="系统设置" />
      
      <div className="px-4 pb-4 pt-0 md:px-6 md:pb-6">
        <QueryStateBanner
          isLoading={isLoading}
          isError={Boolean(error)}
          loadingText="正在同步系统设置..."
          errorText="系统设置暂时无法同步，请确认后端服务已启动。"
          onRetry={() => refetch()}
        />
        <div className="mb-6 border-b border-line">
          <nav className="-mb-px flex gap-6 overflow-x-auto">
            <button
              onClick={() => handleTabChange('company')}
              className={`${
                activeTab === 'company'
                  ? 'border-brand-500 text-brand-600'
                  : 'border-transparent text-ink-secondary hover:text-ink hover:border-line'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              公司信息
            </button>
            <button
              onClick={() => handleTabChange('users')}
              className={`${
                activeTab === 'users'
                  ? 'border-brand-500 text-brand-600'
                  : 'border-transparent text-ink-secondary hover:text-ink hover:border-line'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              用户管理
            </button>
            <button
              onClick={() => handleTabChange('vision')}
              className={`${
                activeTab === 'vision'
                  ? 'border-brand-500 text-brand-600'
                  : 'border-transparent text-ink-secondary hover:text-ink hover:border-line'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              识别配置
            </button>
          </nav>
        </div>

        {activeTab === 'users' ? (
          <UserManagement />
        ) : activeTab === 'vision' ? (
          <VisionSettings />
        ) : (
          <div className="-mx-4 bg-white md:-mx-6">
            <div className="p-6">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                    <Building2 className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="text-base font-semibold text-ink">公司信息</h3>
                    <p className="mt-0.5 text-sm text-ink-tertiary">用于对账单抬头与系统显示</p>
                  </div>
                </div>
                {!isEditing && (
                  <button
                    onClick={handleEdit}
                    className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700 sm:w-auto"
                  >
                    <Pencil className="h-4 w-4" />
                    编辑
                  </button>
                )}
              </div>

              {!isEditing ? (
                <dl className="divide-y divide-line-soft border-t border-line-soft">
                  {companyFields.map((field) => (
                    <div
                      key={field.label}
                      className="flex items-center justify-between gap-4 py-3.5"
                    >
                      <dt className="shrink-0 text-sm text-ink-tertiary">{field.label}</dt>
                      <dd className="text-right text-sm font-medium text-ink">
                        {field.value || '—'}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-ink-secondary">公司名称</label>
                      <input
                        type="text"
                        value={companyData.name}
                        onChange={(e) => setCompanyData({ ...companyData, name: e.target.value })}
                        className={inputClass}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-ink-secondary">联系人</label>
                      <input
                        type="text"
                        value={companyData.contactPerson || ''}
                        onChange={(e) =>
                          setCompanyData({ ...companyData, contactPerson: e.target.value })
                        }
                        className={inputClass}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-ink-secondary">电话</label>
                      <input
                        type="text"
                        value={companyData.phone || ''}
                        onChange={(e) => setCompanyData({ ...companyData, phone: e.target.value })}
                        className={inputClass}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-ink-secondary">地址</label>
                      <input
                        type="text"
                        value={companyData.address || ''}
                        onChange={(e) => setCompanyData({ ...companyData, address: e.target.value })}
                        className={inputClass}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-ink-secondary">税率</label>
                      <input
                        type="text"
                        value={companyData.statementTaxLabel || ''}
                        onChange={(e) =>
                          setCompanyData({ ...companyData, statementTaxLabel: e.target.value })
                        }
                        placeholder="例如：不含税"
                        className={inputClass}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-ink-secondary">结款模式</label>
                      <input
                        type="text"
                        value={companyData.statementSettlementLabel || ''}
                        onChange={(e) =>
                          setCompanyData({ ...companyData, statementSettlementLabel: e.target.value })
                        }
                        placeholder="例如：月结30天"
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <button
                      onClick={handleCancel}
                      className="min-h-11 rounded-lg border border-line bg-white px-4 py-2 text-sm font-medium text-ink-secondary shadow-sm transition-colors hover:bg-canvas"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleSave}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700"
                    >
                      <Save className="h-4 w-4" />
                      保存
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
    </div>
  </Layout>
);
};

export default Settings;
