import { AppDataSource } from '../config/database';
import {
  InventoryRecord,
  InventoryRecordStatus,
  InventoryRecordSubmissionMode,
  Product,
  User,
  UserRole,
} from '../entities';
import type { EntityManager } from '../lib/typeorm';
import { AppError } from '../utils/AppError';
import { roundLineAmount, roundQuantity, roundUnitPrice } from '../utils/decimal';

type InventoryRecordItemInput = {
  productId: string;
  quantity: number;
};

type CreateInventoryRecordInput = {
  records: InventoryRecordItemInput[];
  submittedBy?: string;
  submissionMode?: InventoryRecordSubmissionMode;
};

type UpdateInventoryRecordInput = {
  productId?: string;
  quantity?: number;
  submittedBy?: string;
  remark?: string | null;
};

type CreateInventoryContext = {
  actorId: string;
  submittedBy: string;
  submissionMode: InventoryRecordSubmissionMode;
  status: InventoryRecordStatus;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
};

export class InventoryService {
  private inventoryRepository = AppDataSource.getRepository(InventoryRecord);

  private async getUserCodeDigits(userId: string, manager: EntityManager): Promise<string> {
    const user = await manager.findOne(User, { where: { id: userId } });
    if (!user) throw new AppError('用户不存在', 404);
    const userCodeMatch = user.code ? user.code.match(/\d+/) : null;
    return userCodeMatch ? userCodeMatch[0] : '000';
  }

  private formatRecordNumber(date: Date, userCodeDigits: string, sequence: number): string {
    const year = String(date.getFullYear()).substring(2);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}${month}${day}`;
    const seq = String(sequence).padStart(3, '0');
    return `${dateStr}-${userCodeDigits}-${seq}`;
  }

  private getDayRange(baseDate: Date) {
    const startOfDay = new Date(baseDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(baseDate);
    endOfDay.setHours(23, 59, 59, 999);
    return { startOfDay, endOfDay };
  }

  private async getDailyRecordCount(userId: string, manager: EntityManager, baseDate: Date): Promise<number> {
    const { startOfDay, endOfDay } = this.getDayRange(baseDate);
    const count = await manager
      .getRepository(InventoryRecord)
      .createQueryBuilder('record')
      .where('record.submittedBy = :userId', { userId })
      .andWhere('record.createdAt >= :startOfDay', { startOfDay })
      .andWhere('record.createdAt <= :endOfDay', { endOfDay })
      .getCount();
    return count;
  }

  async generateInventoryRecordNumber(userId: string, manager: EntityManager): Promise<string> {
    const userCodeDigits = await this.getUserCodeDigits(userId, manager);
    const now = new Date();
    const count = await this.getDailyRecordCount(userId, manager, now);
    return this.formatRecordNumber(now, userCodeDigits, count + 1);
  }

  private async getProductOrThrow(productId: string, manager: EntityManager) {
    const product = await manager.findOne(Product, { where: { id: productId } });
    if (!product) {
      throw new AppError('产品不存在', 404);
    }
    return product;
  }

  private async getSubmitterOrThrow(userId: string, manager: EntityManager) {
    const user = await manager.findOne(User, { where: { id: userId } });
    if (!user) {
      throw new AppError('提交人不存在', 404);
    }
    if (!user.isActive) {
      throw new AppError('提交人已停用，无法分配入库单', 400);
    }
    return user;
  }

  private normalizeRemark(remark?: string | null) {
    if (remark === undefined) {
      return undefined;
    }

    const trimmed = typeof remark === 'string' ? remark.trim() : '';
    return trimmed ? trimmed : null;
  }

  private async adjustProductStock(
    manager: EntityManager,
    productId: string,
    deltaQuantity: number,
    errorMessage = '库存不足，无法完成当前操作',
  ) {
    const product = await this.getProductOrThrow(productId, manager);
    const nextStock = roundQuantity((Number(product.stock) || 0) + Number(deltaQuantity));
    if (nextStock < 0) {
      throw new AppError(errorMessage, 400);
    }

    product.stock = nextStock;
    await manager.save(product);
  }

  private async resolveCreateContext(
    actorId: string,
    role: UserRole,
    data: CreateInventoryRecordInput,
    manager: EntityManager,
  ): Promise<CreateInventoryContext> {
    const createdAt = new Date();

    if (role === UserRole.ADMIN) {
      const submissionMode = data.submissionMode || InventoryRecordSubmissionMode.ADMIN_ASSIGN;
      if (submissionMode !== InventoryRecordSubmissionMode.ADMIN_ASSIGN) {
        throw new AppError('管理员创建入库单仅支持管理员分配模式', 400);
      }
      if (!data.submittedBy) {
        throw new AppError('管理员分配时必须选择提交人', 400);
      }

      await this.getSubmitterOrThrow(data.submittedBy, manager);

      return {
        actorId,
        submittedBy: data.submittedBy,
        submissionMode,
        status: InventoryRecordStatus.APPROVED,
        reviewedBy: actorId,
        reviewedAt: createdAt,
        createdAt,
      };
    }

    return {
      actorId,
      submittedBy: actorId,
      submissionMode: InventoryRecordSubmissionMode.EMPLOYEE_SUBMIT,
      status: InventoryRecordStatus.PENDING,
      reviewedBy: null,
      reviewedAt: null,
      createdAt,
    };
  }

  async createInventoryRecord(actorId: string, role: UserRole, data: CreateInventoryRecordInput) {
    if (!data.records || data.records.length === 0) {
      throw new AppError('至少需要一条入库记录', 400);
    }

    return AppDataSource.transaction(async (manager) => {
      const context = await this.resolveCreateContext(actorId, role, data, manager);
      const userCodeDigits = await this.getUserCodeDigits(context.submittedBy, manager);
      const count = await this.getDailyRecordCount(context.submittedBy, manager, context.createdAt);
      const results = [];

      for (const [index, item] of data.records.entries()) {
        const recordNumber = this.formatRecordNumber(context.createdAt, userCodeDigits, count + index + 1);
        const result = await this.createSingleRecord(context, item, manager, recordNumber);
        results.push(result);
      }

      return results;
    });
  }

  private async createSingleRecord(
    context: CreateInventoryContext,
    data: InventoryRecordItemInput,
    manager: EntityManager,
    recordNumber?: string,
  ) {
    const { productId, quantity } = data;
    const normalizedQuantity = roundQuantity(quantity);

    if (!productId || quantity === undefined) {
      throw new AppError('产品ID和数量为必填项', 400);
    }
    if (normalizedQuantity <= 0) {
      throw new AppError('数量必须大于0', 400);
    }

    const product = await this.getProductOrThrow(productId, manager);
    const unitPrice = roundUnitPrice(product.costPrice);
    const totalAmount = roundLineAmount(normalizedQuantity, unitPrice);

    const finalRecordNumber = recordNumber || await this.generateInventoryRecordNumber(context.submittedBy, manager);

    const record = manager.create(InventoryRecord, {
      recordNumber: finalRecordNumber,
      productId,
      submittedBy: context.submittedBy,
      quantity: normalizedQuantity,
      unitPrice,
      totalAmount,
      status: context.status,
      submissionMode: context.submissionMode,
      reviewedBy: context.reviewedBy,
      reviewedAt: context.reviewedAt,
      createdAt: context.createdAt,
      updatedAt: context.createdAt,
    });

    await manager.save(record);

    if (context.status === InventoryRecordStatus.APPROVED) {
      await this.adjustProductStock(manager, productId, normalizedQuantity);
    }

    return manager.findOne(InventoryRecord, {
      where: { id: record.id },
      relations: ['product', 'submitter', 'reviewer'],
    });
  }

  async getInventoryRecords(userId: string | undefined, role: UserRole) {
    const queryBuilder = this.inventoryRepository
      .createQueryBuilder('record')
      .leftJoinAndSelect('record.product', 'product')
      .leftJoinAndSelect('record.submitter', 'submitter')
      .leftJoinAndSelect('record.reviewer', 'reviewer');

    if (role === UserRole.PIECE_RATE && userId) {
      queryBuilder.where('record.submittedBy = :userId', { userId });
    }

    return queryBuilder.orderBy('record.createdAt', 'DESC').getMany();
  }

  async getInventoryRecordById(id: string, userId: string, role: UserRole) {
    const record = await this.inventoryRepository.findOne({
      where: { id },
      relations: ['product', 'submitter', 'reviewer'],
    });

    if (!record) {
      throw new AppError('入库单不存在', 404);
    }

    if (role === UserRole.PIECE_RATE && record.submittedBy !== userId) {
      throw new AppError('无权查看此入库单', 403);
    }

    return record;
  }

  async reviewInventoryRecord(id: string, reviewerId: string, data: { status: InventoryRecordStatus; quantity?: number; remark?: string }) {
    return AppDataSource.transaction(async (manager) => {
      const record = await manager.findOne(InventoryRecord, { where: { id } });

      if (!record) {
        throw new AppError('入库单不存在', 404);
      }

      if (record.status !== InventoryRecordStatus.PENDING) {
        throw new AppError('入库单已审核', 400);
      }

      record.status = data.status;
      record.reviewedBy = reviewerId;
      record.reviewedAt = new Date();
      if (data.remark !== undefined) {
        record.remark = this.normalizeRemark(data.remark) ?? null;
      }

      if (data.quantity !== undefined) {
        const normalizedQuantity = roundQuantity(data.quantity);
        if (normalizedQuantity <= 0) throw new AppError('数量必须大于0', 400);
        record.quantity = normalizedQuantity;
        record.totalAmount = roundLineAmount(normalizedQuantity, record.unitPrice);
      }

      await manager.save(record);

      if (data.status === InventoryRecordStatus.APPROVED) {
        await this.adjustProductStock(manager, record.productId, Number(record.quantity));
      }

      return manager.findOne(InventoryRecord, {
        where: { id: record.id },
        relations: ['product', 'submitter', 'reviewer'],
      });
    });
  }

  async reviewInventoryRecordsBatch(
    ids: string[],
    reviewerId: string,
    data: { status: InventoryRecordStatus; remark?: string },
  ) {
    const uniqueIds = Array.from(new Set(ids));
    if (uniqueIds.length === 0) {
      throw new AppError('请选择需要审核的入库单', 400);
    }
    if (![InventoryRecordStatus.APPROVED, InventoryRecordStatus.REJECTED].includes(data.status)) {
      throw new AppError('批量审核状态无效', 400);
    }

    return AppDataSource.transaction(async (manager) => {
      const records: InventoryRecord[] = [];

      for (const id of uniqueIds) {
        const record = await manager.findOne(InventoryRecord, { where: { id } });
        if (!record) {
          throw new AppError('部分入库单不存在，请刷新后重试', 404);
        }
        if (record.status !== InventoryRecordStatus.PENDING) {
          throw new AppError(`入库单 ${record.recordNumber || record.id} 已审核，无法重复处理`, 400);
        }
        records.push(record);
      }

      const reviewedAt = new Date();
      const remark = this.normalizeRemark(data.remark) ?? null;
      for (const record of records) {
        record.status = data.status;
        record.reviewedBy = reviewerId;
        record.reviewedAt = reviewedAt;
        record.remark = remark;
        await manager.save(record);

        if (data.status === InventoryRecordStatus.APPROVED) {
          await this.adjustProductStock(manager, record.productId, Number(record.quantity));
        }
      }

      return manager.find(InventoryRecord, {
        where: records.map((record) => ({ id: record.id })),
        relations: ['product', 'submitter', 'reviewer'],
      });
    });
  }

  async updateInventoryRecord(id: string, userId: string, role: UserRole, data: UpdateInventoryRecordInput) {
    return AppDataSource.transaction(async (manager) => {
      const record = await manager.findOne(InventoryRecord, { where: { id } });

      if (!record) {
        throw new AppError('入库单不存在', 404);
      }

      if (role !== UserRole.ADMIN) {
        if (record.submittedBy !== userId) {
          throw new AppError('无权修改此入库单', 403);
        }
        if (record.status !== InventoryRecordStatus.REJECTED) {
          throw new AppError('只能修改被驳回的入库单', 400);
        }
        if (data.submittedBy && data.submittedBy !== userId) {
          throw new AppError('无权修改提交人', 403);
        }
      } else {
        if (record.status !== InventoryRecordStatus.APPROVED) {
          throw new AppError('只能修改已通过的入库单', 400);
        }
      }

      const nextProductId = data.productId || record.productId;
      const nextProduct = await this.getProductOrThrow(nextProductId, manager);
      let nextQuantity = record.quantity;
      if (data.quantity !== undefined) {
        const normalizedQuantity = roundQuantity(data.quantity);
        if (normalizedQuantity <= 0) throw new AppError('数量必须大于0', 400);
        nextQuantity = normalizedQuantity;
      }
      const nextSubmittedBy = role === UserRole.ADMIN && data.submittedBy
        ? (await this.getSubmitterOrThrow(data.submittedBy, manager)).id
        : record.submittedBy;
      const nextRemark = this.normalizeRemark(data.remark);
      const inventoryChanged = nextProductId !== record.productId || nextQuantity !== record.quantity;

      if (role === UserRole.ADMIN && inventoryChanged) {
        await this.adjustProductStock(
          manager,
          record.productId,
          -Number(record.quantity),
          '当前库存不足，无法修改已入库信息',
        );
      }

      record.productId = nextProductId;
      record.quantity = nextQuantity;
      record.unitPrice = roundUnitPrice(nextProduct.costPrice);
      record.totalAmount = roundLineAmount(nextQuantity, record.unitPrice);

      if (role === UserRole.ADMIN) {
        record.submittedBy = nextSubmittedBy;
        if (nextRemark !== undefined) {
          record.remark = nextRemark;
        }
        record.status = InventoryRecordStatus.APPROVED;
        record.reviewedBy = userId;
        record.reviewedAt = new Date();
      } else {
        record.status = InventoryRecordStatus.PENDING;
        record.reviewedBy = null;
        record.reviewedAt = null;
        record.remark = null;
      }

      await manager.save(record);

      if (role === UserRole.ADMIN && inventoryChanged) {
        await this.adjustProductStock(manager, nextProductId, Number(nextQuantity));
      }

      return manager.findOne(InventoryRecord, {
        where: { id: record.id },
        relations: ['product', 'submitter', 'reviewer'],
      });
    });
  }

  async deleteInventoryRecord(id: string, userId: string, role: UserRole) {
    return AppDataSource.transaction(async (manager) => {
      const record = await manager.findOne(InventoryRecord, { where: { id } });
      if (!record) {
        throw new AppError('入库单不存在', 404);
      }

      if (role !== UserRole.ADMIN) {
        throw new AppError('无权删除此入库单', 403);
      }

      if (record.status !== InventoryRecordStatus.APPROVED) {
        throw new AppError('只能删除已通过的入库单', 400);
      }

      await this.adjustProductStock(manager, record.productId, -Number(record.quantity), '当前库存不足，无法删除该入库单');

      await manager.delete(InventoryRecord, { id });
      return true;
    });
  }
}

export const inventoryService = new InventoryService();
