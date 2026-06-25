import React, { useState } from 'react';
import Layout from '../components/Layout';
import DashboardKpiStrip from '../components/dashboard/DashboardKpiStrip';
import BusinessTrend from '../components/dashboard/BusinessTrend';
import ProductGrowthPanel from '../components/dashboard/ProductGrowthPanel';
import CounterpartyRanking from '../components/dashboard/CounterpartyRanking';
import EmployeeRanking from '../components/dashboard/EmployeeRanking';
import StockAlertPanel from '../components/dashboard/StockAlertPanel';
import RecentActivity from '../components/dashboard/RecentActivity';
import PeriodToggle, { DashboardPeriod } from '../components/dashboard/PeriodToggle';
import { CustomerType } from '../types';

const getUserName = (): string => {
  try {
    const stored = localStorage.getItem('user');
    return stored ? JSON.parse(stored).name || '' : '';
  } catch {
    return '';
  }
};

const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

const getGreeting = (hour: number): string => {
  if (hour < 6) return '凌晨好';
  if (hour < 11) return '早上好';
  if (hour < 13) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
};

const Dashboard: React.FC = () => {
  const name = getUserName();
  const now = new Date();
  const dateLabel = `${now.getFullYear()} 年 ${now.getMonth() + 1} 月 ${now.getDate()} 日`;
  const greeting = getGreeting(now.getHours());
  const [period, setPeriod] = useState<DashboardPeriod>('month');

  return (
    <Layout>
      <div className="space-y-4 px-4 pb-6 pt-4 md:px-6 md:pt-5">
        {/* 欢迎 Hero —— 渐变 + 氛围装饰 */}
        <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-700 via-brand-500 to-[#7AA0FF] px-6 py-6 text-white shadow-card md:px-8">
          <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-white/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 right-44 h-44 w-44 rounded-full bg-white/10 blur-2xl" />
          <svg
            className="pointer-events-none absolute -right-6 top-1/2 hidden h-64 w-64 -translate-y-1/2 opacity-25 sm:block"
            viewBox="0 0 200 200"
            fill="none"
            aria-hidden="true"
          >
            <circle cx="100" cy="100" r="40" stroke="white" strokeWidth="1" />
            <ellipse cx="100" cy="100" rx="92" ry="40" stroke="white" strokeWidth="1" transform="rotate(45 100 100)" />
            <ellipse cx="100" cy="100" rx="92" ry="40" stroke="white" strokeWidth="1" transform="rotate(-45 100 100)" />
            <ellipse cx="100" cy="100" rx="92" ry="40" stroke="white" strokeWidth="1" />
          </svg>

          <div className="relative z-10">
            <span className="inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur-sm">
              {dateLabel} · {WEEKDAYS[now.getDay()]}
            </span>
            <h1 className="mt-3 text-2xl font-bold tracking-tight md:text-[28px]">
              {greeting}
              {name ? `，${name}` : ''}
            </h1>
            <p className="mt-2 max-w-xl text-sm text-white/85">
              企业经营全景一目了然 —— 销售产值、现金流与往来余额，实时掌握。
            </p>
          </div>
        </section>

        {/* 经营概览：今日 / 本月 / 本年 —— 仅切换「期间发生额」（销售额/产值/收支）；
            结余（应收/应付）、待审核、趋势、排行、动态为当前值或固定口径，不随切换。 */}
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-ink">经营概览</h2>
          <PeriodToggle value={period} onChange={setPeriod} />
        </div>

        {/* 关键指标条 */}
        <DashboardKpiStrip period={period} />

        {/* 经营趋势 + 本期收支 */}
        <BusinessTrend period={period} />

        {/* 重点列表：产品产量变动 / 客户应收 / 供应商应付（各取重点，详情看全部） */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <ProductGrowthPanel />
          <CounterpartyRanking type={CustomerType.CLIENT} />
          <CounterpartyRanking type={CustomerType.SUPPLIER} />
        </div>

        {/* 员工产量排行 + 库存预警 */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <EmployeeRanking />
          <StockAlertPanel />
        </div>

        {/* 最近入库动态 */}
        <RecentActivity />
      </div>
    </Layout>
  );
};

export default Dashboard;
