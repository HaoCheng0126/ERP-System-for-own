import { useQuery } from '@tanstack/react-query';
import api from '../utils/api';
import { Customer, CustomerType } from '../types';

/**
 * 往来方（客户 / 供应商）统一获取入口。
 *
 * - 传入 `type` 时只返回该类型：送货单 → 客户(CLIENT)，进货单 → 供应商(SUPPLIER)，
 *   产品报价 → 客户(CLIENT)。
 * - 不传 `type` 时返回全部：对账管理、客户管理。
 *
 * 所有调用共享 `['customers']` 查询缓存（只发一次请求），各自通过 `select`
 * 派生出需要的子集，避免在各页面重复书写过滤逻辑和魔法字符串。
 */
export const useCounterparties = (type?: CustomerType) =>
  useQuery({
    queryKey: ['customers'],
    queryFn: async (): Promise<Customer[]> => {
      const response = await api.get('/customers');
      return response.data as Customer[];
    },
    select: type ? (data: Customer[]) => data.filter((customer) => customer.type === type) : undefined,
  });
