import { AppDataSource } from '../config/database';
import {
  InventoryRecord,
  InventoryRecordStatus,
  InventoryRecordSubmissionMode,
  Product,
  ProductType,
  User,
  UserRole,
} from '../entities';
import type { EntityManager } from '../lib/typeorm';
import { AppError } from '../utils/AppError';
import { roundLineAmount, roundQuantity, roundUnitPrice } from '../utils/decimal';
import { createProductWithManager } from '../controllers/productController';

// 「直接入库（不计工资）」哨兵：管理员提交入库单时把提交人设为该值，表示不指派员工、只入库存。
export const DIRECT_INBOUND_SUBMITTER = '__direct__';

type InventoryRecordItemInput = {
  productId?: string;
  quantity: number;
  newProduct?: { name: string; specification: string; unit: string; costPrice?: number };
  costPriceOverride?: number;
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
      // 直接入库：提交人传哨兵值，不指派任何员工、不计工资，工价记 0。
      if (data.submittedBy === DIRECT_INBOUND_SUBMITTER) {
        return {
          actorId,
          submittedBy: actorId,
          submissionMode: InventoryRecordSubmissionMode.ADMIN_DIRECT,
          status: InventoryRecordStatus.APPROVED,
          reviewedBy: actorId,
          reviewedAt: createdAt,
          createdAt,
        };
      }
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
        const resolved = await this.resolveRecordItem(item, manager, role);
        const recordNumber = this.formatRecordNumber(context.createdAt, userCodeDigits, count + index + 1);
        const result = await this.createSingleRecord(context, resolved, manager, recordNumber);
        results.push(result);
      }

      return results;
    });
  }

  // 解析单条入库明细的产品：支持内联新建产品，及对「无成本单价」的产品补填单价并写回产品资料。
  private async resolveRecordItem(
    item: InventoryRecordItemInput,
    manager: EntityManager,
    role: UserRole,
  ): Promise<{ productId: string; quantity: number }> {
    if (item.newProduct) {
      // 新建产品（含定价）仅管理员可做；员工只能为已有产品提交产量。
      if (role !== UserRole.ADMIN) {
        throw new AppError('员工不能新建产品，请选择已有产品或联系管理员添加', 400);
      }
      const product = await createProductWithManager(manager, {
        name: item.newProduct.name,
        specification: item.newProduct.specification,
        unit: item.newProduct.unit,
        type: ProductType.FINISHED,
        costPrice: item.newProduct.costPrice,
        stock: 0,
      });
      return { productId: product.id, quantity: item.quantity };
    }

    if (!item.productId) {
      throw new AppError('产品ID和数量为必填项', 400);
    }

    // 工价（costPrice）只由管理员设定；员工提交永不改产品工价，避免员工自定工资。
    if (role === UserRole.ADMIN && item.costPriceOverride !== undefined) {
      const product = await this.getProductOrThrow(item.productId, manager);
      const currentCost = Number(product.costPrice) || 0;
      const override = roundUnitPrice(item.costPriceOverride);
      if (currentCost === 0 && override > 0) {
        product.costPrice = override;
        await manager.save(product);
      }
    }

    return { productId: item.productId, quantity: item.quantity };
  }

  // 在调用方事务内创建「管理员分配 + 已审批」的入库单（增加库存且计入计件工资）。
  // 供送货单「现场分配入库」复用；同一员工多笔分配时按提交人递增编号避免冲突。
  async createApprovedRecordsWithManager(
    manager: EntityManager,
    actorId: string,
    allocations: { submittedBy: string; productId: string; quantity: number }[],
  ): Promise<InventoryRecord[]> {
    const createdAt = new Date();
    const results: InventoryRecord[] = [];
    const sequenceBySubmitter = new Map<string, { digits: string; next: number }>();

    for (const allocation of allocations) {
      const submitter = await this.getSubmitterOrThrow(allocation.submittedBy, manager);
      if (submitter.role !== UserRole.PIECE_RATE) {
        throw new AppError('只能分配给计件员工', 400);
      }

      let sequence = sequenceBySubmitter.get(allocation.submittedBy);
      if (!sequence) {
        const digits = await this.getUserCodeDigits(allocation.submittedBy, manager);
        const count = await this.getDailyRecordCount(allocation.submittedBy, manager, createdAt);
        sequence = { digits, next: count + 1 };
        sequenceBySubmitter.set(allocation.submittedBy, sequence);
      }
      const recordNumber = this.formatRecordNumber(createdAt, sequence.digits, sequence.next);
      sequence.next += 1;

      const context: CreateInventoryContext = {
        actorId,
        submittedBy: allocation.submittedBy,
        submissionMode: InventoryRecordSubmissionMode.ADMIN_ASSIGN,
        status: InventoryRecordStatus.APPROVED,
        reviewedBy: actorId,
        reviewedAt: createdAt,
        createdAt,
      };

      const record = await this.createSingleRecord(
        context,
        { productId: allocation.productId, quantity: allocation.quantity },
        manager,
        recordNumber,
      );
      if (record) {
        results.push(record);
      }
    }

    return results;
  }

  // 直接入库（不计工资）：在调用方事务内按管理员身份生成「已通过、工价 0」的入库记录并加库存，
  // 供送货单「现场分配入库 → 直接入库」复用，使其在入库单管理里可查可删。
  async createDirectInboundRecords(
    manager: EntityManager,
    actorId: string,
    allocations: { productId: string; quantity: number }[],
  ): Promise<InventoryRecord[]> {
    const createdAt = new Date();
    const digits = await this.getUserCodeDigits(actorId, manager);
    let count = await this.getDailyRecordCount(actorId, manager, createdAt);
    const results: InventoryRecord[] = [];
    for (const allocation of allocations) {
      count += 1;
      const recordNumber = this.formatRecordNumber(createdAt, digits, count);
      const context: CreateInventoryContext = {
        actorId,
        submittedBy: actorId,
        submissionMode: InventoryRecordSubmissionMode.ADMIN_DIRECT,
        status: InventoryRecordStatus.APPROVED,
        reviewedBy: actorId,
        reviewedAt: createdAt,
        createdAt,
      };
      const record = await this.createSingleRecord(
        context,
        { productId: allocation.productId, quantity: allocation.quantity },
        manager,
        recordNumber,
      );
      if (record) results.push(record);
    }
    return results;
  }

  // 退货扣款：在调用方事务内，为指定员工生成「负数、已审批、不动库存」的入库记录。
  // 当天日期 → 计入本月工资（实时重算自动扣减），不改历史月；只影响工资，库存由退货行的 restock 单独处理。
  async createReturnDeductionRecords(
    manager: EntityManager,
    actorId: string,
    deductions: { employeeId: string; productId: string; quantity: number; remark?: string | null }[],
  ): Promise<InventoryRecord[]> {
    const createdAt = new Date();
    const results: InventoryRecord[] = [];
    const sequenceBySubmitter = new Map<string, { digits: string; next: number }>();

    for (const deduction of deductions) {
      const submitter = await this.getSubmitterOrThrow(deduction.employeeId, manager);
      if (submitter.role !== UserRole.PIECE_RATE) {
        throw new AppError('只能扣计件员工的工资', 400);
      }

      const product = await this.getProductOrThrow(deduction.productId, manager);
      const deductQty = roundQuantity(deduction.quantity);
      if (deductQty <= 0) {
        throw new AppError('退货扣款数量必须大于0', 400);
      }
      const unitPrice = roundUnitPrice(product.costPrice);
      const totalAmount = -roundLineAmount(deductQty, unitPrice);

      let sequence = sequenceBySubmitter.get(deduction.employeeId);
      if (!sequence) {
        const digits = await this.getUserCodeDigits(deduction.employeeId, manager);
        const count = await this.getDailyRecordCount(deduction.employeeId, manager, createdAt);
        sequence = { digits, next: count + 1 };
        sequenceBySubmitter.set(deduction.employeeId, sequence);
      }
      const recordNumber = this.formatRecordNumber(createdAt, sequence.digits, sequence.next);
      sequence.next += 1;

      const record = manager.create(InventoryRecord, {
        recordNumber,
        productId: deduction.productId,
        submittedBy: deduction.employeeId,
        quantity: -deductQty,
        unitPrice,
        totalAmount,
        status: InventoryRecordStatus.APPROVED,
        submissionMode: InventoryRecordSubmissionMode.RETURN_DEDUCTION,
        reviewedBy: actorId,
        reviewedAt: createdAt,
        remark: this.normalizeRemark(deduction.remark) ?? null,
        createdAt,
        updatedAt: createdAt,
      });
      await manager.save(record);
      // 故意不调用 adjustProductStock —— 退货扣款只记工资，不动库存。
      results.push(record);
    }

    return results;
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
    // 直接入库不计工资：工价记 0；其余按产品工价。
    const unitPrice =
      context.submissionMode === InventoryRecordSubmissionMode.ADMIN_DIRECT
        ? 0
        : roundUnitPrice(product.costPrice);
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

  async reviewInventoryRecord(id: string, reviewerId: string, data: { status: InventoryRecordStatus; quantity?: number; remark?: string; rejectionReason?: string }) {
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
      if (data.status === InventoryRecordStatus.REJECTED) {
        record.rejectionReason = this.normalizeRemark(data.rejectionReason) ?? null;
      } else {
        record.rejectionReason = null;
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
    data: { status: InventoryRecordStatus; remark?: string; rejectionReason?: string },
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
      const rejectionReason = data.status === InventoryRecordStatus.REJECTED
        ? (this.normalizeRemark(data.rejectionReason) ?? null)
        : null;
      for (const record of records) {
        record.status = data.status;
        record.reviewedBy = reviewerId;
        record.reviewedAt = reviewedAt;
        record.remark = remark;
        record.rejectionReason = rejectionReason;
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

      if (record.submissionMode === InventoryRecordSubmissionMode.RETURN_DEDUCTION) {
        throw new AppError('退货扣款记录只能通过删除对应退货单撤销', 400);
      }


      if (role !== UserRole.ADMIN) {
        // 员工只能重新提交自己的待审或已驳回的员工提交记录。
        if (record.submittedBy !== userId) {
          throw new AppError('无权修改此入库单', 403);
        }
        if (record.submissionMode !== InventoryRecordSubmissionMode.EMPLOYEE_SUBMIT) {
          throw new AppError('管理员分配的入库单不能由员工修改', 403);
        }
        if (record.status === InventoryRecordStatus.APPROVED) {
          throw new AppError('已通过的入库单不能修改，请联系管理员', 403);
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
      const productChanged = nextProductId !== record.productId;
      const inventoryChanged = productChanged || nextQuantity !== record.quantity;

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
      // 仅在更换产品时按新产品工价重定价；否则保留原单价。
      // 这样改提交人/备注等无关字段不会因产品工价后续变动而静默改写历史工资，
      // 「直接入库（不计工资）」记录的单价也能恒为 0。
      if (productChanged) {
        record.unitPrice = roundUnitPrice(nextProduct.costPrice);
      }
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
        record.rejectionReason = null;
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

      if (record.submissionMode === InventoryRecordSubmissionMode.RETURN_DEDUCTION) {
        throw new AppError('退货扣款记录只能通过删除对应退货单撤销', 400);
      }

      if (role !== UserRole.ADMIN) {
        // 员工只能删除自己提交的待审或已驳回的记录。
        if (record.submittedBy !== userId) {
          throw new AppError('无权删除此入库单', 403);
        }
        if (record.submissionMode === InventoryRecordSubmissionMode.ADMIN_ASSIGN) {
          throw new AppError('管理员分配的入库单不能由员工删除', 403);
        }
        if (record.status === InventoryRecordStatus.APPROVED) {
          throw new AppError('已通过的入库单不能删除，请联系管理员', 403);
        }
        // PENDING 或 REJECTED → 允许删除，不需要回退库存（未通过的记录不曾更新库存）
        await manager.delete(InventoryRecord, { id });
        return true;
      }

      // 管理员：已通过的需先回退库存；待审/驳回直接删除。
      if (record.status === InventoryRecordStatus.APPROVED) {
        await this.adjustProductStock(manager, record.productId, -Number(record.quantity), '当前库存不足，无法删除该入库单');
      }

      await manager.delete(InventoryRecord, { id });
      return true;
    });
  }
}

export const inventoryService = new InventoryService();
