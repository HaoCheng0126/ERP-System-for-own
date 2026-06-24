import React, { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import DateField from '../components/DateField';
import ExportActionDialog from '../components/ExportActionDialog';
import FilterPanel, { ActiveFilter, DateShortcutGroup, FilterField, SearchInput } from '../components/FilterPanel';
import Layout from '../components/Layout';
import { MobileField, MobileFieldGrid, MobileRecordCard } from '../components/MobileRecordCard';
import PageHeader from '../components/PageHeader';
import QueryStateBanner from '../components/QueryStateBanner';
import DisclosureSection from '../components/records/DisclosureSection';
import DateSectionHeader from '../components/records/DateSectionHeader';
import EntityCardHeader from '../components/records/EntityCardHeader';
import RecordsSummaryBar from '../components/records/RecordsSummaryBar';
import api from '../utils/api';
import { formatAmount, formatAmountDetail, formatDisplayDecimal, formatUnitPrice } from '../utils/format';
import { DateRangeShortcut, getDateRangeByShortcut, matchesKeyword } from '../utils/filtering';
import useDebouncedValue from '../hooks/useDebouncedValue';
import { Company, InventoryRecord, InventoryRecordSubmissionMode, SalaryReport, User, UserRole } from '../types';
import { getUserRole } from '../utils/auth';
import { exportPrintable, getShareFallbackMessage, toSafePdfFileName } from '../utils/printShare';

type SalaryDateGroup = {
  date: string;
  records: InventoryRecord[];
  rowCount: number;
  totalAmount: number;
};

type SalarySlipDetailRow = {
  id: string;
  dateKey: string;
  recordNumber: string;
  productName: string;
  specification: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
};

type PrintableSalarySlip = {
  company?: Company;
  user: User;
  title: string;
  periodLabel: string;
  generatedAt: string;
  totalAmount: number;
  totalQuantity: number;
  totalRecords: number;
  rows: SalarySlipDetailRow[];
};

const getDefaultDateRange = () => ({
  startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
  endDate: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0],
});

const toDateKey = (value: string) => {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getPeriodLabel = (startDate: string, endDate: string) => {
  if (startDate && endDate) {
    return `${startDate} 至 ${endDate}`;
  }
  if (startDate) {
    return `${startDate} 起`;
  }
  if (endDate) {
    return `截至 ${endDate}`;
  }
  return '全部时间';
};

const getExportDateRangeFileLabel = (startDate: string, endDate: string) => {
  if (startDate && endDate) {
    return `${startDate}-${endDate}`;
  }
  return '全部日期';
};

const toSafeFileBaseName = (name: string) =>
  name
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || '导出文件';

const escapeCsvValue = (value: string | number | null | undefined) => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const getSalarySlipTitle = (startDate: string, endDate: string) => {
  if (startDate && endDate) {
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    const isSameMonth =
      start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth();
    const isFullMonth =
      start.getDate() === 1 &&
      end.getDate() === new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate();

    if (isSameMonth && isFullMonth) {
      return `${start.getFullYear()}年${String(start.getMonth() + 1).padStart(2, '0')}月工资条`;
    }
  }

  return `${getPeriodLabel(startDate, endDate)} 工资条`;
};

const getGeneratedAtLabel = () =>
  new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date());

const getSortedRecords = (records: InventoryRecord[]) =>
  [...records].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());

const isReturnDeduction = (record: InventoryRecord) =>
  record.submissionMode === InventoryRecordSubmissionMode.RETURN_DEDUCTION;

// 把某员工的入库记录按日期分组（倒序），用于时间线展示。
const groupRecordsByDate = (records: InventoryRecord[]): SalaryDateGroup[] => {
  const buckets = new Map<string, InventoryRecord[]>();
  records.forEach((record) => {
    const key = toDateKey(record.createdAt);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.push(record);
    } else {
      buckets.set(key, [record]);
    }
  });

  return Array.from(buckets.entries())
    .sort((left, right) => (left[0] < right[0] ? 1 : -1))
    .map(([date, dateRecords]) => {
      const sorted = [...dateRecords].sort(
        (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
      );
      return {
        date,
        records: sorted,
        rowCount: sorted.length,
        totalAmount: sorted.reduce((sum, record) => sum + Number(record.totalAmount || 0), 0),
      };
    });
};

const Salary: React.FC = () => {
  const [dateRange, setDateRange] = useState(getDefaultDateRange());
  const [expandedEmployeeIds, setExpandedEmployeeIds] = useState<Set<string>>(new Set());
  const [exportUserId, setExportUserId] = useState<string | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const printableSlipRef = useRef<HTMLDivElement>(null);
  const userRole = getUserRole();
  const isAdmin = userRole === UserRole.ADMIN;
  const debouncedEmployeeSearch = useDebouncedValue(employeeSearch);

  const handleDateShortcut = (shortcut: DateRangeShortcut) => {
    setDateRange(getDateRangeByShortcut(shortcut));
  };

  const toggleEmployeeExpand = (userId: string) => {
    setExpandedEmployeeIds((previous) => {
      const next = new Set(previous);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const { data: salaryReport, isLoading, error, refetch } = useQuery<SalaryReport>({
    queryKey: ['salaryReport', dateRange],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateRange.startDate) params.append('startDate', dateRange.startDate);
      if (dateRange.endDate) params.append('endDate', dateRange.endDate);

      const response = await api.get(`/salary/report?${params.toString()}`);
      return response.data;
    },
  });

  const { data: company } = useQuery<Company>({
    queryKey: ['company'],
    queryFn: async () => {
      const response = await api.get('/company');
      return response.data as Company;
    },
  });

  const printableSlip = useMemo<PrintableSalarySlip | null>(() => {
    if (!exportUserId || !salaryReport) {
      return null;
    }

    const target = salaryReport.report.find((item) => item.user.id === exportUserId);
    if (!target) {
      return null;
    }

    return {
      company,
      user: target.user,
      title: getSalarySlipTitle(dateRange.startDate, dateRange.endDate),
      periodLabel: getPeriodLabel(dateRange.startDate, dateRange.endDate),
      generatedAt: getGeneratedAtLabel(),
      totalAmount: Number(target.totalAmount || 0),
      totalQuantity: Number(target.totalQuantity || 0),
      totalRecords: target.records.length,
      rows: getSortedRecords(target.records).map((record) => ({
        id: record.id,
        dateKey: toDateKey(record.createdAt),
        recordNumber: record.recordNumber || '-',
        productName: record.product?.name || '-',
        specification: record.product?.specification || '-',
        unit: record.product?.unit || '-',
        quantity: Number(record.quantity || 0),
        unitPrice: Number(record.unitPrice || 0),
        totalAmount: Number(record.totalAmount || 0),
      })),
    };
  }, [company, dateRange.endDate, dateRange.startDate, exportUserId, salaryReport]);

  const handleSalaryPdfExport = async (action: 'save' | 'share') => {
    if (!printableSlip || !printableSlipRef.current) return;

    setIsExportingPdf(true);
    const filename = toSafePdfFileName(
      `${getExportDateRangeFileLabel(dateRange.startDate, dateRange.endDate)}_${printableSlip.user.name}工资`,
    );

    try {
      const result = await exportPrintable(
        printableSlipRef.current,
        {
          filename,
          orientation: 'portrait',
          marginMm: 16,
          title: filename.replace(/\.pdf$/i, ''),
          text: `${printableSlip.user.name}的工资条`,
        },
        action,
      );

      if (result === 'fallback-download') {
        window.alert(getShareFallbackMessage());
      }
      if (result !== 'cancelled') {
        setExportUserId(null);
      }
    } catch {
      window.alert('导出失败，请稍后重试。');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const visibleSalaryRows = useMemo(() => {
    return (salaryReport?.report || []).filter((item) =>
      isAdmin
        ? matchesKeyword(debouncedEmployeeSearch, [item.user.name, item.user.code, item.user.username, item.user.phone])
        : true,
    );
  }, [debouncedEmployeeSearch, isAdmin, salaryReport]);

  const visibleSalarySummary = useMemo(
    () => ({
      totalRecords: visibleSalaryRows.reduce((sum, item) => sum + (item.records?.length || 0), 0),
      totalAmount: visibleSalaryRows.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0),
      totalQuantity: visibleSalaryRows.reduce((sum, item) => sum + Number(item.totalQuantity || 0), 0),
    }),
    [visibleSalaryRows],
  );

  const salarySummaryStats = useMemo(
    () => [
      { label: '员工数', value: String(visibleSalaryRows.length) },
      { label: '入库总数量', value: formatDisplayDecimal(visibleSalarySummary.totalQuantity, 4) },
      { label: '工资总额', value: `¥${formatAmount(visibleSalarySummary.totalAmount)}` },
    ],
    [visibleSalaryRows.length, visibleSalarySummary.totalAmount, visibleSalarySummary.totalQuantity],
  );

  const clearFilters = () => {
    setDateRange({ startDate: '', endDate: '' });
    setEmployeeSearch('');
  };

  const activeFilters: ActiveFilter[] = [
    dateRange.startDate || dateRange.endDate
      ? {
          key: 'date',
          label: `日期: ${dateRange.startDate || '不限'} 至 ${dateRange.endDate || '不限'}`,
          onRemove: () => setDateRange({ startDate: '', endDate: '' }),
        }
      : null,
    isAdmin && employeeSearch
      ? {
          key: 'employee',
          label: `员工: ${employeeSearch}`,
          onRemove: () => setEmployeeSearch(''),
        }
      : null,
  ].filter((item): item is ActiveFilter => Boolean(item));

  const handleExport = () => {
    if (!salaryReport) return;

    const rows = [
      ['员工编号', '姓名', '账号', '总数量', '总金额'],
      ...visibleSalaryRows.map((item) => [
        item.user.code || '',
        item.user.name,
        item.user.username,
        formatAmount(item.totalQuantity),
        formatAmount(item.totalAmount),
      ]),
    ];
    const csvContent = `\uFEFF${rows.map((row) => row.map(escapeCsvValue).join(',')).join('\n')}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${toSafeFileBaseName(`${getExportDateRangeFileLabel(dateRange.startDate, dateRange.endDate)}工资汇总`)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <Layout>
      <PageHeader title="工资报表" />

      <style>{`
        @page {
          size: A4 portrait;
          margin: 16mm;
        }

        @media screen {
          .salary-slip-print-root {
            display: none;
          }
        }

        @media print {
          body * {
            visibility: hidden !important;
          }

          .salary-slip-print-root,
          .salary-slip-print-root * {
            visibility: visible !important;
          }

          .salary-slip-print-root {
            position: absolute;
            inset: 0;
            width: 100%;
            background: white;
            padding: 0;
            overflow: visible !important;
            box-sizing: border-box;
          }

          .salary-slip-print-sheet {
            width: 100% !important;
            max-width: none !important;
            padding: 0 !important;
            overflow: visible !important;
            box-sizing: border-box;
          }

          .salary-slip-print-table {
            width: 100% !important;
            table-layout: fixed;
            box-sizing: border-box;
          }

          .salary-slip-print-table thead {
            display: table-header-group;
          }

          .salary-slip-print-table tr,
          .salary-slip-print-table td,
          .salary-slip-print-table th {
            page-break-inside: avoid;
            box-sizing: border-box;
            overflow-wrap: anywhere;
            word-break: break-word;
          }
        }
      `}</style>

      <div className="px-4 pb-4 pt-0 md:px-6 md:pb-6">
        <QueryStateBanner
          isLoading={isLoading}
          isError={Boolean(error)}
          loadingText="正在同步工资报表..."
          errorText="工资报表暂时无法同步，请确认后端服务已启动。"
          onRetry={() => refetch()}
        />
        <div className="-mx-4 overflow-hidden border-b border-line bg-white md:-mx-6">
          <FilterPanel
            totalCount={salaryReport?.report.length || 0}
            filteredCount={visibleSalaryRows.length}
            activeFilters={activeFilters}
            onClear={clearFilters}
            primary={
              <>
                <FilterField label="开始日期" className="lg:w-36">
                  <DateField
                    value={dateRange.startDate}
                    onChange={(value) => setDateRange({ ...dateRange, startDate: value })}
                    className="w-full"
                  />
                </FilterField>
                <FilterField label="结束日期" className="lg:w-36">
                  <DateField
                    value={dateRange.endDate}
                    onChange={(value) => setDateRange({ ...dateRange, endDate: value })}
                    className="w-full"
                  />
                </FilterField>
                <FilterField label="快捷日期" className="sm:col-span-2 lg:w-56">
                  <DateShortcutGroup shortcuts={['month', 'year', 'all']} onSelect={handleDateShortcut} />
                </FilterField>
                {isAdmin && (
                  <FilterField label="员工" className="sm:col-span-2 lg:min-w-[12rem] lg:flex-1">
                    <SearchInput
                      value={employeeSearch}
                      onChange={setEmployeeSearch}
                      placeholder="姓名、编号、账号、电话"
                    />
                  </FilterField>
                )}
              </>
            }
            actions={
              salaryReport ? (
                <button
                  onClick={handleExport}
                  disabled={visibleSalaryRows.length === 0}
                  className="inline-flex min-h-11 items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Download className="mr-2 h-4 w-4" />
                  导出CSV
                </button>
              ) : undefined
            }
          />

        {salaryReport && (
          <div className="bg-canvas p-4 md:p-6">
            {visibleSalaryRows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-6 py-20 text-center">
                <p className="text-base font-medium text-gray-700">没有符合筛选条件的工资记录</p>
                <p className="mt-2 text-sm text-gray-500">清除筛选或调整日期范围后再查看。</p>
              </div>
            ) : (
              <div className="space-y-4">
                <RecordsSummaryBar stats={salarySummaryStats} />
                {visibleSalaryRows.map((item) => {
                  const employeeId = item.user.id;
                  const isExpanded = expandedEmployeeIds.has(employeeId);
                  const dateGroups = groupRecordsByDate(item.records || []);
                  const isNegative = Number(item.totalAmount || 0) < 0;

                  return (
                    <section
                      key={employeeId}
                      className="overflow-hidden rounded-2xl border border-line bg-white shadow-card"
                    >
                      <EntityCardHeader
                        name={item.user.name}
                        initial={item.user.name.slice(0, 1) || '员'}
                        stats={[
                          { label: '工资总额', value: `¥${formatAmount(item.totalAmount)}` },
                          { label: '入库数量', value: formatDisplayDecimal(item.totalQuantity, 4) },
                        ]}
                        note={isNegative ? '本期退货扣款超过新增产值，工资为负，请核对。' : undefined}
                        expanded={isExpanded}
                        onToggle={() => toggleEmployeeExpand(employeeId)}
                        onExport={() => setExportUserId(employeeId)}
                        exportLabel="工资条"
                      />

                      <DisclosureSection open={isExpanded}>
                        <div className="space-y-5 border-t border-line bg-canvas px-3 py-4 sm:px-4">
                          {dateGroups.length === 0 ? (
                            <div className="px-1 py-6 text-center text-sm text-ink-tertiary">本期暂无入库记录</div>
                          ) : (
                            dateGroups.map((dateGroup) => (
                              <div key={dateGroup.date} className="space-y-3">
                                <DateSectionHeader
                                  date={dateGroup.date}
                                  count={dateGroup.rowCount}
                                  countLabel="单"
                                  amount={dateGroup.totalAmount}
                                  formatAmount={formatAmount}
                                />
                                <div className="overflow-hidden rounded-xl border border-line bg-white">
                                  <div className="hidden overflow-x-auto md:block">
                                    <table className="min-w-full">
                                      <thead>
                                        <tr className="border-b border-line bg-canvas text-ink-tertiary">
                                          <th className="px-4 py-2.5 text-left text-xs font-medium">入库单号</th>
                                          <th className="px-4 py-2.5 text-left text-xs font-medium">产品</th>
                                          <th className="px-4 py-2.5 text-right text-xs font-medium">数量</th>
                                          <th className="px-4 py-2.5 text-right text-xs font-medium">单价</th>
                                          <th className="px-4 py-2.5 text-right text-xs font-medium">金额</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-line-soft">
                                        {dateGroup.records.map((record) => {
                                          const isReturn = isReturnDeduction(record);
                                          return (
                                            <tr key={record.id} className="transition-colors hover:bg-brand-50/40">
                                              <td className="px-4 py-2.5 text-sm text-ink-secondary">{record.recordNumber || '-'}</td>
                                              <td className="px-4 py-2.5 text-sm text-ink">
                                                <div className="flex items-center gap-2">
                                                  <span>
                                                    {record.product?.name || '-'}
                                                    {record.product?.specification ? ` (${record.product.specification})` : ''}
                                                  </span>
                                                  {isReturn && (
                                                    <span className="inline-flex shrink-0 items-center rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-600">
                                                      退货扣款
                                                    </span>
                                                  )}
                                                </div>
                                              </td>
                                              <td className={`px-4 py-2.5 text-right text-sm tabular-nums ${isReturn ? 'text-rose-600' : 'text-ink'}`}>
                                                {formatDisplayDecimal(record.quantity, 4)}
                                              </td>
                                              <td className="px-4 py-2.5 text-right text-sm tabular-nums text-ink">
                                                ¥{formatUnitPrice(record.unitPrice)}
                                              </td>
                                              <td className={`px-4 py-2.5 text-right text-sm font-medium tabular-nums ${isReturn ? 'text-rose-600' : 'text-ink'}`}>
                                                ¥{formatAmountDetail(record.totalAmount)}
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                  <div className="space-y-3 p-3 md:hidden">
                                    {dateGroup.records.map((record) => {
                                      const isReturn = isReturnDeduction(record);
                                      return (
                                        <MobileRecordCard key={record.id} className="border-line-soft shadow-none">
                                          <div className="mb-3 flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                              <div className="flex items-center gap-2">
                                                <div className="text-sm font-semibold text-ink">{record.recordNumber || '-'}</div>
                                                {isReturn && (
                                                  <span className="inline-flex shrink-0 items-center rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-600">
                                                    退货扣款
                                                  </span>
                                                )}
                                              </div>
                                            </div>
                                            <div className="shrink-0 text-right">
                                              <div className="text-xs text-ink-tertiary">金额</div>
                                              <div className={`text-base font-bold tabular-nums ${isReturn ? 'text-rose-600' : 'text-ink'}`}>
                                                ¥{formatAmountDetail(record.totalAmount)}
                                              </div>
                                            </div>
                                          </div>
                                          <MobileFieldGrid>
                                            <MobileField
                                              label="产品"
                                              value={`${record.product?.name || '-'}${record.product?.specification ? ` (${record.product.specification})` : ''}`}
                                            />
                                            <MobileField label="单价" value={`¥${formatUnitPrice(record.unitPrice)}`} align="right" />
                                            <MobileField label="数量" value={formatDisplayDecimal(record.quantity, 4)} />
                                          </MobileFieldGrid>
                                        </MobileRecordCard>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </DisclosureSection>
                    </section>
                  );
                })}
              </div>
            )}
          </div>
        )}
        </div>
      </div>

      {printableSlip && (
        <ExportActionDialog
          title="导出工资条"
          description={`为 ${printableSlip.user.name} 生成 PDF 文件，可保存，或打开系统分享面板后选择微信。`}
          isProcessing={isExportingPdf}
          onSave={() => handleSalaryPdfExport('save')}
          onShare={() => handleSalaryPdfExport('share')}
          onClose={() => setExportUserId(null)}
        />
      )}

      {printableSlip && (
        <div ref={printableSlipRef} className="salary-slip-print-root">
          <div className="salary-slip-print-sheet text-gray-900">
            <header className="border-b border-gray-900 pb-6">
              <h1 className="text-center text-[32px] font-semibold tracking-[0.08em]">
                {printableSlip.company?.name || '公司名称'}
              </h1>
              <p className="mt-3 text-center text-[15px]">{printableSlip.title}</p>

              <div className="mt-8 grid grid-cols-2 gap-10 text-[14px] leading-8">
                <div>
                  <div className="grid grid-cols-[110px_1fr]">
                    <span className="font-medium">员工姓名：</span>
                    <span>{printableSlip.user.name}</span>
                  </div>
                  <div className="grid grid-cols-[110px_1fr]">
                    <span className="font-medium">员工编号 / 账号：</span>
                    <span>{printableSlip.user.code || printableSlip.user.username}</span>
                  </div>
                </div>
                <div>
                  <div className="grid grid-cols-[90px_1fr]">
                    <span className="font-medium">工资周期：</span>
                    <span>{printableSlip.periodLabel}</span>
                  </div>
                  <div className="grid grid-cols-[90px_1fr]">
                    <span className="font-medium">打印时间：</span>
                    <span>{printableSlip.generatedAt}</span>
                  </div>
                </div>
              </div>
            </header>

            <section className="mt-8 grid grid-cols-3 gap-4">
              <div className="border border-gray-900 px-4 py-4 text-center">
                <div className="text-sm tracking-[0.08em] text-gray-600">本期工资总额</div>
                <div className="mt-3 text-[24px] font-semibold">¥{formatAmount(printableSlip.totalAmount)}</div>
              </div>
              <div className="border border-gray-900 px-4 py-4 text-center">
                <div className="text-sm tracking-[0.08em] text-gray-600">本期入库总数量</div>
                <div className="mt-3 text-[24px] font-semibold">{printableSlip.totalQuantity}</div>
              </div>
              <div className="border border-gray-900 px-4 py-4 text-center">
                <div className="text-sm tracking-[0.08em] text-gray-600">本期入库单数</div>
                <div className="mt-3 text-[24px] font-semibold">{printableSlip.totalRecords}</div>
              </div>
            </section>

            <section className="mt-8">
              <div className="mb-3 text-[18px] font-semibold">工资明细</div>
              <table className="salary-slip-print-table w-full border-collapse">
                <thead>
                  <tr>
                    <th className="border border-gray-900 px-3 py-3 text-center text-sm font-semibold">日期</th>
                    <th className="border border-gray-900 px-3 py-3 text-center text-sm font-semibold">入库单号</th>
                    <th className="border border-gray-900 px-3 py-3 text-center text-sm font-semibold">产品</th>
                    <th className="border border-gray-900 px-3 py-3 text-center text-sm font-semibold">规格</th>
                    <th className="border border-gray-900 px-3 py-3 text-center text-sm font-semibold">单位</th>
                    <th className="border border-gray-900 px-3 py-3 text-center text-sm font-semibold">数量</th>
                    <th className="border border-gray-900 px-3 py-3 text-center text-sm font-semibold">单价</th>
                    <th className="border border-gray-900 px-3 py-3 text-center text-sm font-semibold">金额</th>
                  </tr>
                </thead>
                <tbody>
                  {printableSlip.rows.length > 0 ? (
                    printableSlip.rows.map((row) => (
                      <tr key={row.id}>
                        <td className="border border-gray-900 px-3 py-3 text-center text-sm">{row.dateKey}</td>
                        <td className="border border-gray-900 px-3 py-3 text-center text-sm">{row.recordNumber}</td>
                        <td className="border border-gray-900 px-3 py-3 text-sm">{row.productName}</td>
                        <td className="border border-gray-900 px-3 py-3 text-sm">{row.specification}</td>
                        <td className="border border-gray-900 px-3 py-3 text-center text-sm">{row.unit}</td>
                        <td className="border border-gray-900 px-3 py-3 text-right text-sm">{row.quantity}</td>
                        <td className="border border-gray-900 px-3 py-3 text-right text-sm">
                          ¥{formatUnitPrice(row.unitPrice)}
                        </td>
                        <td className="border border-gray-900 px-3 py-3 text-right text-sm">
                          ¥{formatAmountDetail(row.totalAmount)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="border border-gray-900 px-3 py-8 text-center text-sm text-gray-500">
                        本期无记录
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>

            <section className="mt-10 grid grid-cols-2 gap-12 text-[14px] leading-10">
              <div className="border-t border-gray-900 pt-3">员工确认签字：</div>
              <div className="border-t border-gray-900 pt-3">财务复核：</div>
            </section>
            <section className="mt-6 border-t border-gray-900 pt-3 text-[14px] leading-8">
              备注：
            </section>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default Salary;
