import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, CheckCircle, XCircle, DollarSign, TrendingUp, TrendingDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import api from '../utils/api';
import { User, UserRole } from '../types';
import { formatAmount } from '../utils/format';

const EmployeeDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const { data: stats, isLoading } = useQuery({
    queryKey: ['employeeStats'],
    queryFn: async () => {
      const response = await api.get('/dashboard/employee-stats');
      return response.data;
    },
  });

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      setCurrentUser(JSON.parse(userStr));
    }
  }, []);

  const LoadingCard = () => (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 animate-pulse">
      <div className="flex items-center justify-between mb-4">
        <div className="h-4 w-20 bg-gray-200 rounded"></div>
        <div className="w-9 h-9 bg-gray-200 rounded-lg"></div>
      </div>
      <div className="h-8 w-16 bg-gray-200 rounded mb-2"></div>
      <div className="h-4 w-24 bg-gray-200 rounded"></div>
    </div>
  );

  return (
    <Layout>
      <PageHeader title="工作台" subtitle="查看您的工作进度和工资统计" />
      
      <div className="p-8 space-y-8">
        {/* 状态卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {isLoading ? (
            <>
              <LoadingCard />
              <LoadingCard />
              <LoadingCard />
              <LoadingCard />
            </>
          ) : (
            <>
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-gray-500 text-sm">待审核入库单</div>
                  <div className="p-2 bg-orange-50 rounded-lg text-orange-600">
                    <FileText className="w-5 h-5" />
                  </div>
                </div>
                <div className="text-3xl font-bold text-gray-800">{stats?.pendingCount || 0}</div>
                <div className="text-sm text-orange-500 mt-2">需要管理员审核</div>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-gray-500 text-sm">已拒绝入库单</div>
                  <div className="p-2 bg-red-50 rounded-lg text-red-600">
                    <XCircle className="w-5 h-5" />
                  </div>
                </div>
                <div className="text-3xl font-bold text-gray-800">{stats?.rejectedCount || 0}</div>
                <div className="text-sm text-red-500 mt-2">请及时修改重提</div>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-gray-500 text-sm">本月已通过</div>
                  <div className="p-2 bg-green-50 rounded-lg text-green-600">
                    <CheckCircle className="w-5 h-5" />
                  </div>
                </div>
                <div className="text-3xl font-bold text-gray-800">{stats?.approvedMonthCount || 0}</div>
                <div className="text-sm text-green-500 mt-2">单</div>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-gray-500 text-sm">本月预估工资</div>
                  <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                    <DollarSign className="w-5 h-5" />
                  </div>
                </div>
                <div className="text-3xl font-bold text-gray-800">¥{formatAmount(stats?.currentMonthWage || 0)}</div>
                <div className="flex items-center mt-2 text-sm">
                  {stats?.wageChangePercentage > 0 ? (
                    <span className="text-green-500 flex items-center">
                      <TrendingUp className="w-3 h-3 mr-1" />
                      +{stats.wageChangePercentage.toFixed(1)}%
                    </span>
                  ) : stats?.wageChangePercentage < 0 ? (
                    <span className="text-red-500 flex items-center">
                      <TrendingDown className="w-3 h-3 mr-1" />
                      {stats.wageChangePercentage.toFixed(1)}%
                    </span>
                  ) : (
                    <span className="text-gray-400">与上月持平</span>
                  )}
                  <span className="text-gray-400 ml-1">较上月</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* 快捷入口或其他信息 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">快捷操作</h3>
          <div className="flex gap-4">
             <button 
                onClick={() => window.location.href = '/inventory'}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
             >
                去提交入库单
             </button>
             <button 
                onClick={() => window.location.href = '/salary'}
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
             >
                查看详细工资报表
             </button>
          </div>
        </div>
      </div>
      {currentUser && (
        <button
          onClick={() => navigate('/employee-system')}
          className="fixed bottom-6 right-6 bg-white border border-gray-200 shadow-lg rounded-full px-4 py-2 flex items-center gap-3 hover:shadow-xl transition-shadow"
        >
          <div className="w-9 h-9 rounded-full bg-[#7E6BF6] text-white flex items-center justify-center text-sm font-medium">
            {currentUser.name.charAt(0)}
          </div>
          <div className="text-left">
            <div className="text-sm font-medium text-gray-900">{currentUser.name}</div>
            <div className="text-xs text-gray-500">
              {currentUser.role === UserRole.ADMIN ? '管理员' : '计件工人'}
            </div>
          </div>
        </button>
      )}
    </Layout>
  );
};

export default EmployeeDashboard;
