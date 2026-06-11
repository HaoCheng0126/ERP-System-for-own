import 'dotenv/config';
import { AppDataSource } from './config/database';
import {
  User,
  UserRole,
  Product,
  Customer,
  InventoryRecord,
  InventoryRecordStatus,
  InventoryRecordSubmissionMode,
  DeliveryOrder,
  DeliveryOrderItem,
  Statement,
  StatementPeriod,
  ProductPrice,
} from './entities';
import bcrypt from 'bcrypt';

async function seedData() {
  try {
    await AppDataSource.initialize();
    console.log('数据库连接成功');

    const userRepository = AppDataSource.getRepository(User);
    const productRepository = AppDataSource.getRepository(Product);
    const customerRepository = AppDataSource.getRepository(Customer);
    const inventoryRepository = AppDataSource.getRepository(InventoryRecord);
    const deliveryOrderRepository = AppDataSource.getRepository(DeliveryOrder);
    const deliveryOrderItemRepository = AppDataSource.getRepository(DeliveryOrderItem);
    const statementRepository = AppDataSource.getRepository(Statement);
    const productPriceRepository = AppDataSource.getRepository(ProductPrice);

    // 清空现有数据 (按外键依赖顺序)
    console.log('正在清理旧数据...');
    // 使用 query runner 执行 TRUNCATE 命令来快速清空表并重置自增 ID (如果需要)
    // 或者使用 delete 并传入条件
    await deliveryOrderItemRepository.createQueryBuilder().delete().execute();
    await deliveryOrderRepository.createQueryBuilder().delete().execute();
    await statementRepository.createQueryBuilder().delete().execute();
    await inventoryRepository.createQueryBuilder().delete().execute();
    await productPriceRepository.createQueryBuilder().delete().execute();
    await customerRepository.createQueryBuilder().delete().execute();
    await productRepository.createQueryBuilder().delete().execute();
    await userRepository.createQueryBuilder().delete().execute();

    // 1. 创建用户 (SE001 - SE004)
    const password = await bcrypt.hash('123456', 10);
    const adminPassword = await bcrypt.hash('admin123', 10);

    const users = [
      { username: 'admin', name: '系统管理员', role: UserRole.ADMIN, code: 'SE001', password: adminPassword },
      { username: 'zhangsan', name: '张三', role: UserRole.PIECE_RATE, code: 'SE002', phone: '13800138002', password },
      { username: 'lisi', name: '李四', role: UserRole.PIECE_RATE, code: 'SE003', phone: '13800138003', password },
      { username: 'wangwu', name: '王五', role: UserRole.PIECE_RATE, code: 'SE004', phone: '13800138004', password },
    ];

    const savedUsers: User[] = [];
    for (const u of users) {
      const user = userRepository.create(u);
      await userRepository.save(user);
      savedUsers.push(user);
    }
    console.log(`已创建 ${users.length} 个用户`);

    // 2. 创建产品
    const productsData = [
      { name: 'SmA-丁针', specification: 'Jo3-8.3503', unit: '100个', purchasePrice: 0.2, baseSalePrice: 0.3 },
      { name: 'SmB-丁针', specification: 'Jo3-8.3504', unit: '100个', purchasePrice: 0.25, baseSalePrice: 0.38 },
      { name: 'SmC-丁针', specification: 'Jo3-8.3505', unit: '100个', purchasePrice: 0.18, baseSalePrice: 0.28 },
      { name: '端子A', specification: 'TER-001', unit: '个', purchasePrice: 0.05, baseSalePrice: 0.08 },
      { name: '端子B', specification: 'TER-002', unit: '个', purchasePrice: 0.06, baseSalePrice: 0.1 },
    ];

    const savedProducts: Product[] = [];
    for (const p of productsData) {
      const product = productRepository.create(p);
      await productRepository.save(product);
      savedProducts.push(product);
    }
    console.log(`已创建 ${productsData.length} 个产品`);

    // 3. 创建客户
    const customersData = [
      { name: '深圳电子有限公司', address: '深圳市福田区', contactPerson: '王总', phone: '13900139001' },
      { name: '广州科技有限公司', address: '广州市天河区', contactPerson: '陈总', phone: '13900139002' },
      { name: '东莞贸易公司', address: '东莞市莞城区', contactPerson: '刘总', phone: '13900139003' },
    ];

    const savedCustomers: Customer[] = [];
    for (let i = 0; i < customersData.length; i++) {
      const customer = customerRepository.create({
        ...customersData[i],
        code: String(i + 1).padStart(3, '0'),
      });
      await customerRepository.save(customer);
      savedCustomers.push(customer);
    }
    console.log(`已创建 ${customersData.length} 个客户`);

    // 4. 创建入库单 (生成2026年2月的数据)
    // 规则: YYMMDD + 3位流水 + 3位工号
    const pieceRateUsers = savedUsers.filter(u => u.role === UserRole.PIECE_RATE);
    const targetMonth = new Date('2026-02-01'); // 2026年2月
    
    let inventoryCount = 0;
    for (let day = 1; day <= 28; day++) {
      // 每天随机生成 2-5 单
      const dailyOrders = Math.floor(Math.random() * 4) + 2;
      
      // 模拟当天的流水号计数器 (用户ID -> 计数)
      const userDailyCount: Record<string, number> = {};

      for (let i = 0; i < dailyOrders; i++) {
        const user = pieceRateUsers[Math.floor(Math.random() * pieceRateUsers.length)];
        const product = savedProducts[Math.floor(Math.random() * savedProducts.length)];
        const quantity = Math.floor(Math.random() * 500) + 100;
        
        // 增加该用户当天的流水号
        userDailyCount[user.id] = (userDailyCount[user.id] || 0) + 1;
        const sequence = String(userDailyCount[user.id]).padStart(3, '0');
        
        // 生成日期对象
        const date = new Date(targetMonth);
        date.setDate(day);
        date.setHours(Math.floor(Math.random() * 8) + 9, Math.floor(Math.random() * 60)); // 9:00 - 17:00

        // 生成编号: YYMMDD + 流水号(3位) + 工号后3位
        const dateStr = '2602' + String(day).padStart(2, '0');
        const userCodeSuffix = user.code ? user.code.substring(2) : '000';
        const recordNumber = `${dateStr}${sequence}${userCodeSuffix}`;

        const status = Math.random() > 0.1 ? InventoryRecordStatus.APPROVED : InventoryRecordStatus.PENDING;

        const record = inventoryRepository.create({
          recordNumber,
          product,
          submittedBy: user.id,
          quantity,
          unitPrice: product.costPrice,
          totalAmount: quantity * product.costPrice,
          status,
          submissionMode: InventoryRecordSubmissionMode.EMPLOYEE_SUBMIT,
          createdAt: date,
          ...(status === InventoryRecordStatus.APPROVED && {
            reviewedBy: savedUsers[0].id, // admin
            reviewedAt: new Date(date.getTime() + 3600000), // 1小时后审核
          }),
        });
        
        await inventoryRepository.save(record);
        inventoryCount++;
      }
    }
    console.log(`已创建 ${inventoryCount} 条入库单记录 (2026年2月)`);

    // 5. 创建送货单 (2026年2月)
    let deliveryCount = 0;
    for (let i = 0; i < 8; i++) {
      const customer = savedCustomers[Math.floor(Math.random() * savedCustomers.length)];
      const day = Math.floor(Math.random() * 20) + 1; // 1-20号
      const dateStr = '2602' + String(day).padStart(2, '0');
      const sequence = String(i + 1).padStart(3, '0');
      
      const orderNumber = `${dateStr} ${sequence} ${customer.code}`;
      const deliveryDate = `2026-02-${String(day).padStart(2, '0')}`;

      const items: DeliveryOrderItem[] = [];
      let totalAmount = 0;
      
      const itemCount = Math.floor(Math.random() * 3) + 1;
      for (let j = 0; j < itemCount; j++) {
        const product = savedProducts[Math.floor(Math.random() * savedProducts.length)];
        const quantity = Math.floor(Math.random() * 1000) + 500;
        const unitPrice = product.basePrice || 0;
        const amount = quantity * unitPrice;
        
        totalAmount += amount;
        items.push(deliveryOrderItemRepository.create({
          productId: product.id,
          quantity,
          unitPrice,
          amount
        }));
      }

      const order = deliveryOrderRepository.create({
        orderNumber,
        customerId: customer.id,
        deliveryDate,
        totalAmount,
        items
      });
      
      await deliveryOrderRepository.save(order);
      deliveryCount++;
    }
    console.log(`已创建 ${deliveryCount} 条送货单记录`);

    console.log('所有种子数据重置并生成完成！');
    process.exit(0);
  } catch (error) {
    console.error('生成种子数据失败:', error);
    process.exit(1);
  }
}

seedData();
