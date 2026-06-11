import React from 'react';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import InventoryGrowth from '../components/dashboard/InventoryGrowth';
import SalesOverview from '../components/dashboard/SalesOverview';
import CustomerOverview from '../components/dashboard/CustomerOverview';

const Dashboard: React.FC = () => {
  return (
    <Layout>
      <PageHeader title="欢迎回来" subtitle="这是您的企业管理仪表盘" />
      
      <div className="p-8 space-y-8">
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
      </div>
    </Layout>
  );
};

export default Dashboard;
