import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { Customer, DeliveryOrder } from '../entities';
import { AuthRequest } from '../middlewares/auth';

const customerRepository = AppDataSource.getRepository(Customer);
const deliveryOrderRepository = AppDataSource.getRepository(DeliveryOrder);

const generateCustomerCode = async (): Promise<string> => {
  const count = await customerRepository.count();
  return String(count + 1).padStart(3, '0');
};

export const getCustomers = async (req: AuthRequest, res: Response) => {
  try {
    const customers = await customerRepository.find({
      where: { isActive: true },
      order: { createdAt: 'DESC' },
    });
    res.json(customers);
  } catch (error) {
    res.status(500).json({ message: '服务器错误', error });
  }
};

export const getCustomerById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const customer = await customerRepository.findOne({ where: { id } });
    
    if (!customer) {
      return res.status(404).json({ message: '客户不存在' });
    }

    res.json(customer);
  } catch (error) {
    res.status(500).json({ message: '服务器错误', error });
  }
};

export const createCustomer = async (req: AuthRequest, res: Response) => {
  try {
    const code = await generateCustomerCode();
    const customer = customerRepository.create({
      ...req.body,
      code,
    });
    await customerRepository.save(customer);
    res.status(201).json({ message: '客户创建成功', customer });
  } catch (error) {
    res.status(500).json({ message: '服务器错误', error });
  }
};

export const updateCustomer = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const customer = await customerRepository.findOne({ where: { id } });
    
    if (!customer) {
      return res.status(404).json({ message: '客户不存在' });
    }

    customerRepository.merge(customer, req.body);
    await customerRepository.save(customer);
    res.json({ message: '客户更新成功', customer });
  } catch (error) {
    res.status(500).json({ message: '服务器错误', error });
  }
};

export const deleteCustomer = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const customer = await customerRepository.findOne({ where: { id } });
    
    if (!customer) {
      return res.status(404).json({ message: '客户不存在' });
    }

    // 检查是否存在关联的送货单
    const hasDeliveryOrders = await deliveryOrderRepository.count({ where: { customerId: id } });
    if (hasDeliveryOrders > 0) {
      return res.status(400).json({ message: '该客户存在送货单，无法删除' });
    }

    customer.isActive = false;
    await customerRepository.save(customer);
    res.json({ message: '客户已删除' });
  } catch (error) {
    res.status(500).json({ message: '服务器错误', error });
  }
};
