import React from 'react';
import { useQuery } from '@tanstack/react-query';
import ColdStartGuide, { SetupStatus } from '../components/ColdStartGuide';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import InventoryGrowth from '../components/dashboard/InventoryGrowth';
import SalesOverview from '../components/dashboard/SalesOverview';
import CustomerOverview from '../components/dashboard/CustomerOverview';
import api from '../utils/api';

const Dashboard: React.FC = () => {
  const { data: setupStatus, isLoading: isLoadingSetup } = useQuery<SetupStatus>({
    queryKey: ['setupStatus'],
    queryFn: async () => {
      const response = await api.get('/setup/status');
      return response.data;
    },
  });
  const shouldShowColdStart = setupStatus && !setupStatus.isComplete;

  return (
    <Layout>
      <PageHeader title="欢迎回来" subtitle="这是您的企业管理仪表盘" />
      
      <div className="p-8 space-y-8">
        {isLoadingSetup ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500 shadow-sm">加载建账状态中...</div>
        ) : shouldShowColdStart ? (
          <ColdStartGuide status={setupStatus} />
        ) : (
          <>
            {/* 第一部分：库存增长 */}
            <section>
              <InventoryGrowth />
            </section>

            {/* 第二部分：销售概览 */}
            <section>
              <SalesOverview />
            </section>

            {/* 第三部分：客户纵览 */}
            <section>
              <CustomerOverview />
            </section>
          </>
        )}
      </div>
    </Layout>
  );
};

export default Dashboard;
