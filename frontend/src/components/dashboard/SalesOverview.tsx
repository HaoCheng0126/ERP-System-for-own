import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DollarSign, PieChart, TrendingUp } from 'lucide-react';
import api from '../../utils/api';

const SalesOverview: React.FC = () => {
  const [timeRange, setTimeRange] = useState<'month' | 'year'>('month');

  const { data: stats, isLoading } = useQuery({
    queryKey: ['salesStats', timeRange],
    queryFn: async () => {
      const response = await api.get('/dashboard/sales-stats', {
        params: { timeRange }
      });
      return response.data;
    }
  });

  if (isLoading) {
    return <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-200">加载中...</div>;
  }

  const { totalSales, settledAmount } = stats || {};

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="p-6 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-blue-600" />
          销售概览
        </h2>
        <div className="flex bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setTimeRange('month')}
            className={`px-3 py-1 text-sm font-medium rounded-md transition-all ${
              timeRange === 'month' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            本月
          </button>
          <button
            onClick={() => setTimeRange('year')}
            className={`px-3 py-1 text-sm font-medium rounded-md transition-all ${
              timeRange === 'year' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            本年
          </button>
        </div>
      </div>

      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-purple-50 rounded-xl p-6 relative overflow-hidden">
          <div className="absolute right-0 top-0 opacity-10">
            <DollarSign className="w-24 h-24 text-purple-600" />
          </div>
          <div className="relative z-10">
            <p className="text-sm font-medium text-purple-600 mb-1">总销售额 ({timeRange === 'month' ? '本月' : '本年'})</p>
            <h3 className="text-3xl font-bold text-gray-900">¥{(totalSales || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
            <p className="text-xs text-purple-500 mt-2">送货单总额</p>
          </div>
        </div>

        <div className="bg-indigo-50 rounded-xl p-6 relative overflow-hidden">
          <div className="absolute right-0 top-0 opacity-10">
            <PieChart className="w-24 h-24 text-indigo-600" />
          </div>
          <div className="relative z-10">
            <p className="text-sm font-medium text-indigo-600 mb-1">已结算金额 ({timeRange === 'month' ? '本月' : '本年'})</p>
            <h3 className="text-3xl font-bold text-gray-900">¥{(settledAmount || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
            <p className="text-xs text-indigo-500 mt-2">实际回款金额</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SalesOverview;
