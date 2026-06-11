import React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Circle, ClipboardList, Users, Package, Truck, Building2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';

export interface SetupStatus {
  isComplete: boolean;
  canComplete: boolean;
  completedAt?: string | null;
  demoMode: boolean;
  counts: {
    companyCount: number;
    activeEmployeeCount: number;
    productCount: number;
    clientCount: number;
    productPriceCount: number;
    inventoryRecordCount: number;
    deliveryOrderCount: number;
  };
  steps: {
    company: boolean;
    employees: boolean;
    products: boolean;
    customers: boolean;
    prices: boolean;
    inventory: boolean;
    delivery: boolean;
  };
}

interface ColdStartGuideProps {
  status: SetupStatus;
}

const getNextAction = (status: SetupStatus) => {
  if (!status.steps.company) return { label: '完善公司信息', path: '/settings' };
  if (!status.steps.employees) return { label: '添加计件员工', path: '/settings?tab=users' };
  if (!status.steps.products) return { label: '添加产品', path: '/products' };
  if (!status.steps.customers) return { label: '添加客户', path: '/customers' };
  if (!status.steps.prices) return { label: '设置客户价格', path: '/products' };
  if (!status.steps.inventory) return { label: '创建首张入库单', path: '/inventory' };
  return { label: '创建首张送货单', path: '/delivery' };
};

const ColdStartGuide: React.FC<ColdStartGuideProps> = ({ status }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const completeMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/setup/complete');
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['setupStatus'] });
    },
  });

  const steps = [
    {
      title: '公司信息',
      description: '用于对账单抬头、打印和内部识别。',
      complete: status.steps.company,
      icon: Building2,
      detail: status.counts.companyCount > 0 ? '已保存公司资料' : '未保存公司资料',
    },
    {
      title: '员工账号',
      description: '至少添加 1 个计件员工，后续才能提交入库和生成工资。',
      complete: status.steps.employees,
      icon: Users,
      detail: `${status.counts.activeEmployeeCount} 个可用计件员工`,
    },
    {
      title: '产品与入库单价',
      description: '录入产品名称、规格、单位和计件入库单价。',
      complete: status.steps.products,
      icon: Package,
      detail: `${status.counts.productCount} 个产品`,
    },
    {
      title: '客户与送货价格',
      description: '先添加客户，再为产品设置客户送货单价。',
      complete: status.steps.customers && status.steps.prices,
      icon: Users,
      detail: `${status.counts.clientCount} 个客户 / ${status.counts.productPriceCount} 条客户价格`,
    },
    {
      title: '跑通首单',
      description: '创建首张入库单和首张送货单，验证业务闭环。',
      complete: status.steps.inventory && status.steps.delivery,
      icon: Truck,
      detail: `${status.counts.inventoryRecordCount} 张入库单 / ${status.counts.deliveryOrderCount} 张送货单`,
    },
  ];
  const completedCount = steps.filter((step) => step.complete).length;
  const nextAction = getNextAction(status);

  return (
    <section className="overflow-hidden rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-slate-50 shadow-sm">
      <div className="border-b border-blue-100 p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">
              <ClipboardList className="h-3.5 w-3.5" />
              首次建账
            </div>
            <h2 className="text-xl font-semibold text-gray-900">先跑通第一张入库单和送货单</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
              按顺序补齐基础资料，系统会自动把入库单价、客户价格、库存和对账串起来。
            </p>
          </div>

          <div className="rounded-lg border border-blue-100 bg-white px-4 py-3 text-right shadow-sm">
            <div className="text-xs text-gray-500">建账进度</div>
            <div className="mt-1 text-2xl font-semibold text-gray-900">{completedCount}/5</div>
            {status.demoMode && <div className="mt-1 text-xs text-amber-600">演示数据模式已启用</div>}
          </div>
        </div>
      </div>

      <div className="grid gap-3 p-6 lg:grid-cols-5">
        {steps.map((step, index) => {
          const Icon = step.icon;
          return (
            <div key={step.title} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-50 text-blue-600">
                  <Icon className="h-5 w-5" />
                </div>
                {step.complete ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                ) : (
                  <Circle className="h-5 w-5 text-gray-300" />
                )}
              </div>
              <div className="text-xs font-medium text-gray-400">步骤 {index + 1}</div>
              <h3 className="mt-1 text-sm font-semibold text-gray-900">{step.title}</h3>
              <p className="mt-2 min-h-[44px] text-xs leading-5 text-gray-500">{step.description}</p>
              <div className="mt-3 text-xs text-gray-500">{step.detail}</div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 border-t border-blue-100 bg-white/70 px-6 py-4 md:flex-row md:items-center md:justify-between">
        <p className="text-sm text-gray-600">
          {status.canComplete ? '基础闭环已经跑通，可以结束首次建账。' : '继续完成下一步，完成后首页会恢复为经营仪表盘。'}
        </p>
        <div className="flex flex-wrap gap-3">
          {!status.canComplete && (
            <button
              type="button"
              onClick={() => navigate(nextAction.path)}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
            >
              {nextAction.label}
            </button>
          )}
          {status.canComplete && (
            <button
              type="button"
              onClick={() => completeMutation.mutate()}
              disabled={completeMutation.isPending}
              className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-green-700 disabled:opacity-60"
            >
              完成首次建账
            </button>
          )}
        </div>
      </div>
    </section>
  );
};

export default ColdStartGuide;
