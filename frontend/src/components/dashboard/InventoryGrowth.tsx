import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, Clock, Package, TrendingUp } from 'lucide-react';
import api from '../../utils/api';
import { formatAmount } from '../../utils/format';

const InventoryGrowth: React.FC = () => {
  const [timeRange, setTimeRange] = useState<'today' | 'week' | 'month'>('today');

  const { data: stats, isLoading } = useQuery({
    queryKey: ['inventoryStats', timeRange],
    queryFn: async () => {
      const response = await api.get('/dashboard/inventory-stats', {
        params: { timeRange }
      });
      return response.data;
    }
  });

  if (isLoading) {
    return <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-200">加载中...</div>;
  }

  const { pendingReviewCount, totalProductionValue, productGrowth } = stats || {};

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="p-6 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Package className="w-5 h-5 text-blue-600" />
          库存增长
        </h2>
        <div className="flex bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setTimeRange('today')}
            className={`px-3 py-1 text-sm font-medium rounded-md transition-all ${
              timeRange === 'today' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            今日
          </button>
          <button
            onClick={() => setTimeRange('week')}
            className={`px-3 py-1 text-sm font-medium rounded-md transition-all ${
              timeRange === 'week' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            本周
          </button>
          <button
            onClick={() => setTimeRange('month')}
            className={`px-3 py-1 text-sm font-medium rounded-md transition-all ${
              timeRange === 'month' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            本月
          </button>
        </div>
      </div>

      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Stat Cards */}
        <div className="bg-blue-50 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-blue-600 font-medium">待审核入库单</span>
            <Clock className="w-5 h-5 text-blue-500" />
          </div>
          <div className="text-3xl font-bold text-gray-900">{pendingReviewCount || 0}</div>
          <p className="text-sm text-blue-600/80 mt-1">需及时处理</p>
        </div>

        <div className="bg-green-50 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-green-600 font-medium">总产值 ({timeRange === 'today' ? '今日' : timeRange === 'week' ? '本周' : '本月'})</span>
            <Activity className="w-5 h-5 text-green-500" />
          </div>
          <div className="text-3xl font-bold text-gray-900">¥{formatAmount(totalProductionValue || 0)}</div>
          <p className="text-sm text-green-600/80 mt-1">入库单总金额</p>
        </div>
      </div>

      {/* Product Growth Table */}
      <div className="px-6 pb-6">
        <h3 className="text-sm font-medium text-gray-500 mb-4">产品新增情况 (今日 vs 昨日)</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">产品名称</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">今日新增</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">昨日新增</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">环比增长</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {(productGrowth || []).map((product: any) => (
                <tr key={product.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900 font-medium">{product.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">{product.todayQty}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 text-right">{product.yesterdayQty}</td>
                  <td className="px-4 py-3 text-sm text-right">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        product.growthRate > 0
                          ? 'bg-green-100 text-green-800'
                          : product.growthRate < 0
                          ? 'bg-red-100 text-red-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {product.growthRate > 0 ? '+' : ''}
                      {product.growthRate.toFixed(1)}%
                      {product.growthRate !== 0 && <TrendingUp className={`w-3 h-3 ml-1 ${product.growthRate < 0 ? 'transform rotate-180' : ''}`} />}
                    </span>
                  </td>
                </tr>
              ))}
              {(productGrowth || []).length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-500 text-sm">
                    暂无数据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default InventoryGrowth;
