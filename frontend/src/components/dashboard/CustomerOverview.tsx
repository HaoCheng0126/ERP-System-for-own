import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, AlertCircle } from 'lucide-react';
import api from '../../utils/api';

const CustomerOverview: React.FC = () => {
  const { data: customers, isLoading } = useQuery({
    queryKey: ['customerStats'],
    queryFn: async () => {
      const response = await api.get('/dashboard/customer-stats');
      return response.data;
    }
  });

  if (isLoading) {
    return <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-200">加载中...</div>;
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="p-6 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Users className="w-5 h-5 text-blue-600" />
          客户纵览
        </h2>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">客户名称</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">总交易额</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">待结算款</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {(customers || []).map((customer: any) => (
              <tr key={customer.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{customer.name}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                  ¥{customer.totalAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-bold text-right">
                  <span className={customer.pendingAmount > 0 ? 'text-orange-600' : 'text-green-600'}>
                    ¥{customer.pendingAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-center">
                  {customer.pendingAmount > 0 ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      需催款
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      已结清
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {(customers || []).length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-gray-500 text-sm">
                  暂无客户数据
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CustomerOverview;
