import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { Statement, StatementPeriod, Customer, CustomerType } from '../entities';
import { AuthRequest } from '../middlewares/auth';
import { accountingService } from '../services/accountingService';

const statementRepository = AppDataSource.getRepository(Statement);
const customerRepository = AppDataSource.getRepository(Customer);

export const getReconciliation = async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate, customerId, type, activityScope } = req.query;
    const reconciliation = await accountingService.getReconciliation({
      startDate: typeof startDate === 'string' ? startDate : undefined,
      endDate: typeof endDate === 'string' ? endDate : undefined,
      customerId: typeof customerId === 'string' ? customerId : undefined,
      type: type === CustomerType.CLIENT || type === CustomerType.SUPPLIER ? type : 'all',
      activityScope: activityScope === 'active' || activityScope === 'balance' ? activityScope : 'all',
    });
    res.json(reconciliation);
  } catch (error) {
    res.status(500).json({ message: '服务器错误' });
  }
};

export const getStatements = async (req: AuthRequest, res: Response) => {
  try {
    const { customerId, startDate, endDate } = req.query;

    let queryBuilder = statementRepository.createQueryBuilder('statement')
      .leftJoinAndSelect('statement.customer', 'customer')
      .orderBy('statement.createdAt', 'DESC');

    if (customerId) {
      queryBuilder.andWhere('statement.customerId = :customerId', { customerId });
    }

    if (startDate && endDate) {
      queryBuilder.andWhere('statement.startDate >= :startDate AND statement.endDate <= :endDate', { startDate, endDate });
    }

    const statements = await queryBuilder.getMany();
    res.json(statements);
  } catch (error) {
    res.status(500).json({ message: '服务器错误' });
  }
};

export const createStatement = async (req: AuthRequest, res: Response) => {
  try {
    const { customerId, period, startDate, endDate, remark } = req.body;

    const customer = await customerRepository.findOne({ where: { id: customerId } });
    if (!customer) {
      return res.status(404).json({ message: '客户不存在' });
    }

    const reconciliation = await accountingService.getReconciliation({
      customerId,
      startDate,
      endDate,
      type: customer.type,
      activityScope: 'all',
    });
    const group = reconciliation[0];
    const totalAmount = group?.periodBusiness || 0;

    const statement = statementRepository.create({
      customerId,
      period: period as StatementPeriod,
      startDate,
      endDate,
      totalAmount,
      remark,
    });

    await statementRepository.save(statement);

    const savedStatement = await statementRepository.findOne({
      where: { id: statement.id },
      relations: ['customer'],
    });

    res.status(201).json({ 
      message: '对账单生成成功', 
      statement: savedStatement,
      reconciliation: group,
    });
  } catch (error) {
    res.status(500).json({ message: '服务器错误' });
  }
};
