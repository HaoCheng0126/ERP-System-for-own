import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { Statement, StatementPeriod, DeliveryOrder, Customer } from '../entities';
import { AuthRequest } from '../middlewares/auth';

const statementRepository = AppDataSource.getRepository(Statement);
const deliveryOrderRepository = AppDataSource.getRepository(DeliveryOrder);
const customerRepository = AppDataSource.getRepository(Customer);

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
    res.status(500).json({ message: '服务器错误', error });
  }
};

export const createStatement = async (req: AuthRequest, res: Response) => {
  try {
    const { customerId, period, startDate, endDate, remark } = req.body;

    const customer = await customerRepository.findOne({ where: { id: customerId } });
    if (!customer) {
      return res.status(404).json({ message: '客户不存在' });
    }

    const deliveryOrders = await deliveryOrderRepository
      .createQueryBuilder('order')
      .where('order.customerId = :customerId', { customerId })
      .andWhere('order.deliveryDate BETWEEN :startDate AND :endDate', { startDate, endDate })
      .getMany();

    const totalAmount = deliveryOrders.reduce((sum, order) => sum + Number(order.totalAmount), 0);

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
      deliveryOrders,
    });
  } catch (error) {
    res.status(500).json({ message: '服务器错误', error });
  }
};
