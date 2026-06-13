import React, { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calendar, Download, X } from 'lucide-react';
import DateField from '../components/DateField';
import ExportActionDialog from '../components/ExportActionDialog';
import Layout from '../components/Layout';
import { MobileActionBar, MobileField, MobileFieldGrid, MobileRecordCard } from '../components/MobileRecordCard';
import PageHeader from '../components/PageHeader';
import QueryStateBanner from '../components/QueryStateBanner';
import api from '../utils/api';
import { formatAmount, formatUnitPrice } from '../utils/format';
import { Company, InventoryRecord, SalaryReport, User, UserRole } from '../types';
import { getUserRole } from '../utils/auth';
import { createPdfFileFromElement, downloadPdfFile, sharePdfFile, toSafePdfFileName } from '../utils/printShare';

type SalaryDetailsState = {
  user: User;
  records: InventoryRecord[];
};

type SalaryDailySummaryRow = {
  dateKey: string;
  recordCount: number;
  totalQuantity: number;
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
  rows: SalaryDailySummaryRow[];
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

const Salary: React.FC = () => {
  const [dateRange, setDateRange] = useState(getDefaultDateRange());
  const [selectedUserRecords, setSelectedUserRecords] = useState<SalaryDetailsState | null>(null);
  const [exportUserId, setExportUserId] = useState<string | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const printableSlipRef = useRef<HTMLDivElement>(null);
  const userRole = getUserRole();
  const isAdmin = userRole === UserRole.ADMIN;

  const handleDateShortcut = (type: 'month' | 'year' | 'all') => {
    const today = new Date();
    let start = '';
    let end = '';

    if (type === 'month') {
      start = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
      end = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];
    } else if (type === 'year') {
      start = new Date(today.getFullYear(), 0, 1).toISOString().split('T')[0];
      end = new Date(today.getFullYear(), 11, 31).toISOString().split('T')[0];
    } else if (type === 'all') {
      start = '2020-01-01';
      end = '2099-12-31';
    }

    setDateRange({ startDate: start, endDate: end });
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

    const rowsMap = new Map<string, SalaryDailySummaryRow>();

    getSortedRecords(target.records).forEach((record) => {
      const dateKey = toDateKey(record.createdAt);
      const currentRow = rowsMap.get(dateKey) || {
        dateKey,
        recordCount: 0,
        totalQuantity: 0,
        totalAmount: 0,
      };

      currentRow.recordCount += 1;
      currentRow.totalQuantity += Number(record.quantity || 0);
      currentRow.totalAmount += Number(record.totalAmount || 0);
      rowsMap.set(dateKey, currentRow);
    });

    return {
      company,
      user: target.user,
      title: getSalarySlipTitle(dateRange.startDate, dateRange.endDate),
      periodLabel: getPeriodLabel(dateRange.startDate, dateRange.endDate),
      generatedAt: getGeneratedAtLabel(),
      totalAmount: Number(target.totalAmount || 0),
      totalQuantity: Number(target.totalQuantity || 0),
      totalRecords: target.records.length,
      rows: Array.from(rowsMap.values()).sort((left, right) => left.dateKey.localeCompare(right.dateKey)),
    };
  }, [company, dateRange.endDate, dateRange.startDate, exportUserId, salaryReport]);

  const handleSalaryPdfExport = async (action: 'save' | 'share') => {
    if (!printableSlip || !printableSlipRef.current) return;

    setIsExportingPdf(true);
    const filename = toSafePdfFileName(`工资条_${printableSlip.user.name}_${printableSlip.periodLabel}`);

    try {
      const file = await createPdfFileFromElement(printableSlipRef.current, {
        filename,
        orientation: 'portrait',
        marginMm: 16,
      });

      if (action === 'save') {
        downloadPdfFile(file);
        setExportUserId(null);
        return;
      }

      const result = await sharePdfFile(file, {
        title: filename.replace(/\.pdf$/i, ''),
        text: `${printableSlip.user.name}的工资条`,
      });

      if (result === 'downloaded') {
        window.alert('当前浏览器无法直接分享到微信，已保存 PDF，可发送到微信。');
      }
      if (result !== 'cancelled') {
        setExportUserId(null);
      }
    } catch {
      window.alert('PDF 生成失败，请稍后重试。');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleSearch = () => {
    refetch();
  };

  const handleExport = () => {
    if (!salaryReport) return;

    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += '姓名,总金额,总数量\n';

    salaryReport.report.forEach((item) => {
      csvContent += `${item.user.name},¥${formatAmount(item.totalAmount)},${item.totalQuantity}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `工资报表_${dateRange.startDate}_${dateRange.endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleShowDetails = (user: User, records: InventoryRecord[]) => {
    setSelectedUserRecords({ user, records: getSortedRecords(records) });
  };

  return (
    <Layout>
      <PageHeader title="工资报表" subtitle="查看计件工资统计" />

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

      <div className="p-4 md:p-8">
        <QueryStateBanner
          isLoading={isLoading}
          isError={Boolean(error)}
          loadingText="正在同步工资报表..."
          errorText="工资报表暂时无法同步，请确认后端服务已启动。"
          onRetry={() => refetch()}
        />
        <div className="mb-6 rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="p-4 md:p-6">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end">
              <div className="min-w-0">
                <label className="mb-1 block text-sm font-medium text-gray-700">开始日期</label>
                <DateField
                  value={dateRange.startDate}
                  onChange={(value) => setDateRange({ ...dateRange, startDate: value })}
                  className="w-full"
                />
              </div>
              <div className="min-w-0">
                <label className="mb-1 block text-sm font-medium text-gray-700">结束日期</label>
                <DateField
                  value={dateRange.endDate}
                  onChange={(value) => setDateRange({ ...dateRange, endDate: value })}
                  className="w-full"
                />
              </div>

              <div className="grid grid-cols-3 gap-2 pb-0.5 sm:col-span-2 lg:col-span-1">
                <button
                  onClick={() => handleDateShortcut('month')}
                  className="min-h-11 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  本月
                </button>
                <button
                  onClick={() => handleDateShortcut('year')}
                  className="min-h-11 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  今年
                </button>
                <button
                  onClick={() => handleDateShortcut('all')}
                  className="min-h-11 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  全部
                </button>
              </div>

              <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row lg:col-span-1 lg:ml-auto">
                <button
                  onClick={handleSearch}
                  className="inline-flex min-h-11 items-center justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
                >
                  <Calendar className="mr-2 h-4 w-4" />
                  查询
                </button>
                {salaryReport && (
                  <button
                    onClick={handleExport}
                    className="inline-flex min-h-11 items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    导出CSV
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {salaryReport && (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[760px]">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">姓名</th>
                    <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">总金额</th>
                    <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">总数量</th>
                    <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {(salaryReport.report || []).map((item, index) => (
                    <tr key={index}>
                      <td className="whitespace-nowrap px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">{item.user.name}</div>
                        <div className="text-sm text-gray-500">{item.user.code || item.user.username}</div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium text-gray-900">
                        ¥{formatAmount(item.totalAmount)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right text-sm text-gray-900">
                        {item.totalQuantity}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                        <div className="flex justify-end gap-4">
                          <button
                            onClick={() => handleShowDetails(item.user, item.records)}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            查看详情
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => setExportUserId(item.user.id)}
                              className="inline-flex items-center text-emerald-600 hover:text-emerald-800"
                            >
                              <Download className="mr-1 h-4 w-4" />
                              导出工资条
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 p-4 md:hidden">
              {(salaryReport.report || []).map((item, index) => (
                <MobileRecordCard key={item.user.id || index}>
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-base font-semibold text-gray-900">{item.user.name}</div>
                      <div className="mt-1 text-sm text-gray-500">{item.user.code || item.user.username}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-xs text-gray-500">工资</div>
                      <div className="text-lg font-bold text-blue-600">¥{formatAmount(item.totalAmount)}</div>
                    </div>
                  </div>
                  <MobileFieldGrid>
                    <MobileField label="总数量" value={item.totalQuantity} />
                    <MobileField label="记录数" value={item.records?.length || 0} align="right" />
                  </MobileFieldGrid>
                  <MobileActionBar>
                    <button
                      onClick={() => handleShowDetails(item.user, item.records)}
                      className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-blue-100 px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50"
                    >
                      查看详情
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => setExportUserId(item.user.id)}
                        className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-emerald-100 px-3 py-2 text-sm font-medium text-emerald-600 hover:bg-emerald-50"
                      >
                        <Download className="h-4 w-4" />
                        导出工资条
                      </button>
                    )}
                  </MobileActionBar>
                </MobileRecordCard>
              ))}
            </div>

            <div className="border-t border-gray-200 bg-gray-50 px-4 py-4 md:px-6">
              <div className="grid grid-cols-1 gap-3 text-center sm:grid-cols-3 sm:gap-4">
                <div>
                  <div className="text-sm text-gray-500">总记录数</div>
                  <div className="text-xl font-bold text-gray-900">{salaryReport.summary?.totalRecords || 0}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">总数量</div>
                  <div className="text-xl font-bold text-gray-900">{salaryReport.summary?.totalQuantity || 0}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">总金额</div>
                  <div className="text-xl font-bold text-blue-600">¥{formatAmount(salaryReport.summary?.totalAmount || 0)}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {selectedUserRecords && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-end justify-center px-0 pb-0 pt-4 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" aria-hidden="true">
              <div
                className="absolute inset-0 bg-gray-500 opacity-75"
                onClick={() => setSelectedUserRecords(null)}
              ></div>
            </div>

            <span className="hidden sm:inline-block sm:h-screen sm:align-middle" aria-hidden="true">
              &#8203;
            </span>

            <div className="inline-block w-full transform overflow-hidden rounded-t-2xl bg-white text-left align-bottom shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-4xl sm:rounded-lg sm:align-middle">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <h3 className="text-lg font-medium leading-6 text-gray-900">
                    {selectedUserRecords.user.name} 的工资详情
                  </h3>
                  <button
                    onClick={() => setSelectedUserRecords(null)}
                    className="text-gray-400 hover:text-gray-500"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="max-h-[65vh] overflow-y-auto">
                  <table className="hidden min-w-[800px] w-full divide-y divide-gray-200 md:table">
                    <thead className="sticky top-0 bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">入库单号</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">日期</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">产品</th>
                        <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">单价</th>
                        <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">数量</th>
                        <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">金额</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {selectedUserRecords.records.map((record) => (
                        <tr key={record.id}>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">{record.recordNumber}</td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{toDateKey(record.createdAt)}</td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                            {record.product?.name} ({record.product?.specification})
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-right text-sm text-gray-500">
                            ¥{formatUnitPrice(record.unitPrice)}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-right text-sm text-gray-500">{record.quantity}</td>
                          <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium text-gray-900">
                            ¥{formatAmount(record.totalAmount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50 font-medium">
                      <tr>
                        <td colSpan={4} className="px-6 py-3 text-right text-gray-900">
                          合计:
                        </td>
                        <td className="px-6 py-3 text-right text-gray-900">
                          {selectedUserRecords.records.reduce((sum, record) => sum + Number(record.quantity || 0), 0)}
                        </td>
                        <td className="px-6 py-3 text-right text-blue-600">
                          ¥
                          {formatAmount(
                            selectedUserRecords.records.reduce(
                              (sum, record) => sum + Number(record.totalAmount || 0),
                              0,
                            ),
                          )}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                  <div className="space-y-3 md:hidden">
                    {selectedUserRecords.records.map((record) => (
                      <MobileRecordCard key={record.id} className="shadow-none">
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-gray-900">{record.recordNumber}</div>
                            <div className="mt-1 text-xs text-gray-500">{toDateKey(record.createdAt)}</div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="text-xs text-gray-500">金额</div>
                            <div className="text-base font-bold text-blue-600">¥{formatAmount(record.totalAmount)}</div>
                          </div>
                        </div>
                        <MobileFieldGrid>
                          <MobileField label="产品" value={`${record.product?.name || '-'} (${record.product?.specification || '-'})`} />
                          <MobileField label="单价" value={`¥${formatUnitPrice(record.unitPrice)}`} align="right" />
                          <MobileField label="数量" value={record.quantity} />
                          <MobileField label="金额" value={`¥${formatAmount(record.totalAmount)}`} align="right" />
                        </MobileFieldGrid>
                      </MobileRecordCard>
                    ))}
                    <div className="rounded-xl bg-gray-50 p-4">
                      <MobileFieldGrid>
                        <MobileField
                          label="合计数量"
                          value={selectedUserRecords.records.reduce((sum, record) => sum + Number(record.quantity || 0), 0)}
                        />
                        <MobileField
                          label="合计金额"
                          value={`¥${formatAmount(
                            selectedUserRecords.records.reduce(
                              (sum, record) => sum + Number(record.totalAmount || 0),
                              0,
                            ),
                          )}`}
                          align="right"
                        />
                      </MobileFieldGrid>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6">
                <button
                  type="button"
                  onClick={() => setSelectedUserRecords(null)}
                  className="mt-3 inline-flex min-h-11 w-full justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-base font-medium text-gray-700 shadow-sm hover:bg-gray-50 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {printableSlip && (
        <ExportActionDialog
          title="导出工资条"
          description={`为 ${printableSlip.user.name} 保存 PDF，或在手机端分享到微信。`}
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
                    <th className="border border-gray-900 px-3 py-3 text-center text-sm font-semibold">入库单数</th>
                    <th className="border border-gray-900 px-3 py-3 text-center text-sm font-semibold">当日总数量</th>
                    <th className="border border-gray-900 px-3 py-3 text-center text-sm font-semibold">当日工资</th>
                  </tr>
                </thead>
                <tbody>
                  {printableSlip.rows.length > 0 ? (
                    printableSlip.rows.map((row) => (
                      <tr key={row.dateKey}>
                        <td className="border border-gray-900 px-3 py-3 text-center text-sm">{row.dateKey}</td>
                        <td className="border border-gray-900 px-3 py-3 text-center text-sm">{row.recordCount}</td>
                        <td className="border border-gray-900 px-3 py-3 text-right text-sm">{row.totalQuantity}</td>
                        <td className="border border-gray-900 px-3 py-3 text-right text-sm">
                          ¥{formatAmount(row.totalAmount)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="border border-gray-900 px-3 py-8 text-center text-sm text-gray-500">
                        本期无记录
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default Salary;
