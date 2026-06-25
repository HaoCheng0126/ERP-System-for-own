import { AppDataSource } from '../config/database';
import { SalaryDeduction } from '../entities';
import type { EntityManager } from '../lib/typeorm';
import { AppError } from '../utils/AppError';
import { roundCurrencyAmount } from '../utils/decimal';

const repo = () => AppDataSource.getRepository(SalaryDeduction);

type CreateInput = {
  employeeId: string;
  type?: string;
  amount: number;
  reason?: string | null;
  returnOrderId?: string | null;
  deductionDate: string;
  createdBy: string;
};

class SalaryDeductionService {
  async create(data: CreateInput): Promise<SalaryDeduction> {
    const entity = repo().create({
      employeeId: data.employeeId,
      type: data.type || 'other',
      amount: roundCurrencyAmount(data.amount),
      reason: data.reason?.trim() || null,
      returnOrderId: data.returnOrderId || null,
      deductionDate: data.deductionDate,
      createdBy: data.createdBy,
    });
    await repo().save(entity);
    return repo().findOne({ where: { id: entity.id }, relations: ['employee'] }) as Promise<SalaryDeduction>;
  }

  async list(filters: {
    employeeId?: string;
    startDate?: string;
    endDate?: string;
    month?: string;
  } = {}): Promise<SalaryDeduction[]> {
    const qb = repo()
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.employee', 'employee')
      .leftJoinAndSelect('d.returnOrder', 'returnOrder');

    if (filters.month) {
      const [y, m] = filters.month.split('-').map(Number);
      const start = `${y}-${String(m).padStart(2, '0')}-01`;
      const lastDay = new Date(y, m, 0).getDate();
      const end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      qb.andWhere('d.deductionDate >= :start AND d.deductionDate <= :end', { start, end });
    } else if (filters.startDate && filters.endDate) {
      qb.andWhere('d.deductionDate >= :startDate AND d.deductionDate <= :endDate', {
        startDate: filters.startDate,
        endDate: filters.endDate,
      });
    }

    if (filters.employeeId) {
      qb.andWhere('d.employeeId = :employeeId', { employeeId: filters.employeeId });
    }

    return qb.orderBy('d.deductionDate', 'DESC').addOrderBy('d.createdAt', 'DESC').getMany();
  }

  async delete(id: string): Promise<void> {
    const deduction = await repo().findOne({ where: { id } });
    if (!deduction) throw new AppError('扣款记录不存在', 404);
    if (deduction.returnOrderId) {
      throw new AppError('退货关联的扣款记录请通过删除退货单来撤销', 400);
    }
    await repo().delete(id);
  }

  async createBatchWithManager(
    manager: EntityManager,
    actorId: string,
    returnOrderId: string,
    deductionDate: string,
    items: { employeeId: string; amount: number; reason: string; quantity?: number; unitPrice?: number }[],
  ): Promise<void> {
    if (items.length === 0) return;
    const entities = items.map((item) =>
      manager.create(SalaryDeduction, {
        employeeId: item.employeeId,
        type: 'return',
        amount: roundCurrencyAmount(item.amount),
        quantity: item.quantity ?? null,
        unitPrice: item.unitPrice ?? null,
        reason: item.reason,
        returnOrderId,
        deductionDate,
        createdBy: actorId,
      }),
    );
    await manager.save(SalaryDeduction, entities);
  }

  async deleteByReturnOrder(manager: EntityManager, returnOrderId: string): Promise<void> {
    await manager.delete(SalaryDeduction, { returnOrderId });
  }
}

export const salaryDeductionService = new SalaryDeductionService();
