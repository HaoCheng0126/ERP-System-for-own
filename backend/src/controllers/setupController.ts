import { Response } from 'express';
import { AppDataSource } from '../config/database';
import {
  Company,
  Customer,
  CustomerType,
  DeliveryOrder,
  InventoryRecord,
  Product,
  ProductPrice,
  SetupState,
  User,
  UserRole,
} from '../entities';
import { AuthRequest } from '../middlewares/auth';

const isNonEmpty = (value?: string | null) => Boolean(value && value.trim());

const getSetupState = async () => {
  const repository = AppDataSource.getRepository(SetupState);
  let state = await repository.findOne({ where: {} });
  if (!state) {
    state = repository.create({ completedAt: null, completedBy: null });
    await repository.save(state);
  }
  return state;
};

const buildSetupStatus = async () => {
  const companyRepository = AppDataSource.getRepository(Company);
  const userRepository = AppDataSource.getRepository(User);
  const productRepository = AppDataSource.getRepository(Product);
  const customerRepository = AppDataSource.getRepository(Customer);
  const productPriceRepository = AppDataSource.getRepository(ProductPrice);
  const inventoryRepository = AppDataSource.getRepository(InventoryRecord);
  const deliveryRepository = AppDataSource.getRepository(DeliveryOrder);

  const state = await getSetupState();
  const company = await companyRepository.findOne({ where: {} });
  const [
    activeEmployeeCount,
    productCount,
    clientCount,
    productPriceCount,
    inventoryRecordCount,
    deliveryOrderCount,
  ] = await Promise.all([
    userRepository.count({ where: { role: UserRole.PIECE_RATE, isActive: true } }),
    productRepository.count({ where: { isActive: true } }),
    customerRepository.count({ where: { type: CustomerType.CLIENT, isActive: true } }),
    productPriceRepository.count(),
    inventoryRepository.count(),
    deliveryRepository.count(),
  ]);

  const steps = {
    company: isNonEmpty(company?.name),
    employees: activeEmployeeCount > 0,
    products: productCount > 0,
    customers: clientCount > 0,
    prices: productPriceCount > 0,
    inventory: inventoryRecordCount > 0,
    delivery: deliveryOrderCount > 0,
  };
  const canComplete = Object.values(steps).every(Boolean);

  return {
    isComplete: Boolean(state.completedAt),
    canComplete,
    completedAt: state.completedAt,
    demoMode: process.env.ENABLE_DEMO_DATA === 'true',
    counts: {
      companyCount: company ? 1 : 0,
      activeEmployeeCount,
      productCount,
      clientCount,
      productPriceCount,
      inventoryRecordCount,
      deliveryOrderCount,
    },
    steps,
  };
};

export const getSetupStatus = async (_req: AuthRequest, res: Response) => {
  try {
    res.json(await buildSetupStatus());
  } catch (error) {
    res.status(500).json({ message: '服务器错误', error });
  }
};

export const completeSetup = async (req: AuthRequest, res: Response) => {
  try {
    const status = await buildSetupStatus();
    if (!status.canComplete) {
      return res.status(400).json({ message: '首次建账还未完成，请先补齐公司、员工、产品、客户、价格、入库单和送货单' });
    }

    const repository = AppDataSource.getRepository(SetupState);
    const state = await getSetupState();
    state.completedAt = new Date();
    state.completedBy = req.user?.id || null;
    await repository.save(state);

    res.json({ message: '首次建账已完成', setup: state });
  } catch (error) {
    res.status(500).json({ message: '服务器错误', error });
  }
};
