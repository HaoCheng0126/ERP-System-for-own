
import 'reflect-metadata';
import { AppDataSource } from '../config/database';
import {
    User,
    UserRole,
    Product,
    InventoryRecord,
    InventoryRecordStatus,
    InventoryRecordSubmissionMode,
    Customer,
    ProductPrice,
    DeliveryOrder,
    DeliveryOrderItem,
    DeliveryOrderStatus,
    PurchaseOrder,
    PurchaseOrderStatus
} from '../entities';
import bcrypt from 'bcrypt';

async function seedRealData() {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    console.log('Database connected');

    const userRepository = AppDataSource.getRepository(User);
    const productRepository = AppDataSource.getRepository(Product);
    const inventoryRepository = AppDataSource.getRepository(InventoryRecord);
    const customerRepository = AppDataSource.getRepository(Customer);
    const productPriceRepository = AppDataSource.getRepository(ProductPrice);
    const deliveryOrderRepository = AppDataSource.getRepository(DeliveryOrder);
    const deliveryOrderItemRepository = AppDataSource.getRepository(DeliveryOrderItem);
    const purchaseOrderRepository = AppDataSource.getRepository(PurchaseOrder);

    // 1. Clear existing data
    console.log('Clearing existing data...');
    // Delete order: dependent tables first
    await deliveryOrderItemRepository.createQueryBuilder().delete().execute();
    await deliveryOrderRepository.createQueryBuilder().delete().execute();
    await inventoryRepository.createQueryBuilder().delete().execute();
    await productPriceRepository.createQueryBuilder().delete().execute();
    await purchaseOrderRepository.createQueryBuilder().delete().execute();
    
    // We don't delete Users, Products, Customers to preserve IDs if possible, 
    // OR we delete them to ensure clean slate. Let's delete them for a true reset.
    // Be careful with foreign keys.
    // Actually, let's keep it simple: just upsert users/products/customers or clear if needed.
    // For a "re-write", clearing is safer to avoid duplicates or stale data.
    await productRepository.createQueryBuilder().delete().execute();
    await customerRepository.createQueryBuilder().delete().execute();
    await userRepository.createQueryBuilder().delete().execute();

    // 2. Create Users
    console.log('Seeding Users...');
    const admin = userRepository.create({
        username: 'admin',
        password: await bcrypt.hash('admin123', 10),
        name: '系统管理员',
        role: UserRole.ADMIN,
        code: 'SE001'
    });
    await userRepository.save(admin);

    const worker1 = userRepository.create({
        username: 'zhangsan',
        password: await bcrypt.hash('123456', 10),
        name: '张三',
        role: UserRole.PIECE_RATE,
        code: 'SE002'
    });
    await userRepository.save(worker1);

    const worker2 = userRepository.create({
        username: 'lisi',
        password: await bcrypt.hash('123456', 10),
        name: '李四',
        role: UserRole.PIECE_RATE,
        code: 'SE003'
    });
    await userRepository.save(worker2);

    const worker3 = userRepository.create({
        username: 'wangwu',
        password: await bcrypt.hash('123456', 10),
        name: '王五',
        role: UserRole.PIECE_RATE,
        code: 'SE004'
    });
    await userRepository.save(worker3);

    // 3. Create Customers
    console.log('Seeding Customers...');
    const customers = await customerRepository.save([
        { code: 'C001', name: '东莞贸易公司', contactPerson: '刘总', phone: '13800138001', address: '东莞市南城区' },
        { code: 'C002', name: '广州科技有限公司', contactPerson: '陈总', phone: '13900139002', address: '广州市天河区' },
        { code: 'C003', name: '深圳电子有限公司', contactPerson: '王总', phone: '13700137003', address: '深圳市南山区' },
    ]);

    // 4. Create Products
    // costPrice: 员工计件单价 (入库单价)
    // basePrice: 默认销售底价
    console.log('Seeding Products...');
    const products = await productRepository.save([
        { name: 'SmA-丁针', specification: 'Jo3-8.3503', unit: '个', costPrice: 15.00, basePrice: 25.00, stock: 0 },
        { name: 'SmB-丁针', specification: 'Jo3-8.3504', unit: '个', costPrice: 18.00, basePrice: 28.00, stock: 0 },
        { name: 'Tab-A', specification: 'TER-001', unit: '个', costPrice: 12.00, basePrice: 20.00, stock: 0 },
        { name: 'Tab-B', specification: 'TER-002', unit: '个', costPrice: 14.00, basePrice: 22.00, stock: 0 },
        { name: '连接器X', specification: 'CONN-X1', unit: 'kg', costPrice: 50.00, basePrice: 80.00, stock: 0 }, // Test weight unit
    ]);

    // 5. Seed Product Prices (Customer Specific Pricing)
    // Ensure EVERY product has a price for EVERY customer
    console.log('Seeding Product Prices...');
    const pricesToCreate = [];
    
    // Logic: 
    // Customer 1 (C001): High volume, lower price (Base + 10%)
    // Customer 2 (C002): Medium volume, medium price (Base + 20%)
    // Customer 3 (C003): Low volume, high price (Base + 30%)
    
    for (const product of products) {
        // Customer 1
        pricesToCreate.push({
            productId: product.id,
            customerId: customers[0].id,
            price: Number((Number(product.basePrice) * 1.1).toFixed(2))
        });
        // Customer 2
        pricesToCreate.push({
            productId: product.id,
            customerId: customers[1].id,
            price: Number((Number(product.basePrice) * 1.2).toFixed(2))
        });
        // Customer 3
        pricesToCreate.push({
            productId: product.id,
            customerId: customers[2].id,
            price: Number((Number(product.basePrice) * 1.3).toFixed(2))
        });
    }

    for (const p of pricesToCreate) {
        const price = productPriceRepository.create(p);
        await productPriceRepository.save(price);
    }

    // 6. Seed Inventory Records (Production -> Salary Data)
    console.log('Seeding Inventory Records (Salary Data)...');
    
    // We track daily counts to simulate realistic IDs: YYMMDD-EmpCode-Seq
    const inventoryDailyCounts: Record<string, number> = {};

    const createInventory = async (user: User, product: Product, quantity: number, daysAgo: number) => {
        const date = new Date();
        date.setDate(date.getDate() - daysAgo);
        
        // Ensure unitPrice is costPrice
        const unitPrice = product.costPrice;
        const totalAmount = Number((quantity * unitPrice).toFixed(2));

        const dateStr = date.getFullYear().toString().substring(2) + 
                       (date.getMonth() + 1).toString().padStart(2, '0') + 
                       date.getDate().toString().padStart(2, '0');
        const userCodeDigits = user.code ? user.code.replace(/\D/g, '') : '000';
        
        // Track sequence per user per day
        const key = `${dateStr}-${userCodeDigits}`;
        if (!inventoryDailyCounts[key]) inventoryDailyCounts[key] = 0;
        inventoryDailyCounts[key]++;
        const seq = inventoryDailyCounts[key].toString().padStart(3, '0');

        const recordNumber = `${dateStr}-${userCodeDigits}-${seq}`;

        const record = inventoryRepository.create({
            recordNumber: recordNumber,
            productId: product.id,
            submittedBy: user.id,
            quantity: quantity,
            unitPrice: unitPrice,
            totalAmount: totalAmount,
            status: InventoryRecordStatus.APPROVED, // Approved to count for salary
            submissionMode: InventoryRecordSubmissionMode.EMPLOYEE_SUBMIT,
            reviewedBy: admin.id,
            reviewedAt: new Date(),
            createdAt: date,
            updatedAt: date
        });

        await inventoryRepository.save(record);

        // Update Stock
        const p = await productRepository.findOne({ where: { id: product.id } });
        if (p) {
            p.stock = Number(p.stock) + quantity;
            await productRepository.save(p);
        }
    };

    // Simulate production over the last 40 days (covering this month and last month)
    const workers = [worker1, worker2, worker3];
    
    for (let day = 40; day >= 0; day--) {
        // Each worker produces something every few days
        for (const worker of workers) {
            if (Math.random() > 0.3) { // 70% chance to work
                const product = products[Math.floor(Math.random() * products.length)];
                // Random quantity: 1 to 50 (e.g., 5.5 units of 1000pcs = 5500pcs)
                // Use decimal quantities to test new schema
                const quantity = Number((Math.random() * 20 + 1).toFixed(2)); 
                await createInventory(worker, product, quantity, day);
            }
        }
    }

    // 7. Seed Delivery Orders (Sales -> Revenue Data)
    console.log('Seeding Delivery Orders...');
    
    // Track daily counts for delivery orders
    const deliveryDailyCounts: Record<string, number> = {};

    const createDelivery = async (customer: Customer, daysAgo: number) => {
        const date = new Date();
        date.setDate(date.getDate() - daysAgo);
        
        const dateStr = date.getFullYear().toString().substring(2) + 
                       (date.getMonth() + 1).toString().padStart(2, '0') + 
                       date.getDate().toString().padStart(2, '0');
        const custCodeDigits = customer.code ? customer.code.replace(/\D/g, '') : '000';
        
        const key = `${dateStr}-${custCodeDigits}`;
        if (!deliveryDailyCounts[key]) deliveryDailyCounts[key] = 0;
        deliveryDailyCounts[key]++;
        const seq = deliveryDailyCounts[key].toString().padStart(3, '0');

        const orderNumber = `${dateStr}-${custCodeDigits}-${seq}`;

        const order = deliveryOrderRepository.create({
            orderNumber: orderNumber,
            customerId: customer.id,
            deliveryDate: date.toISOString().split('T')[0],
            status: daysAgo > 2 ? DeliveryOrderStatus.SETTLED : DeliveryOrderStatus.PENDING, // Recent ones pending
            totalAmount: 0,
            createdAt: date,
            updatedAt: date
        });
        
        const savedOrder = await deliveryOrderRepository.save(order);

        let totalAmount = 0;
        // 1-3 items per order
        const numItems = Math.floor(Math.random() * 3) + 1;
        const orderItems = [];

        for (let i = 0; i < numItems; i++) {
            const product = products[Math.floor(Math.random() * products.length)];
            
            // Check stock
            const currentProduct = await productRepository.findOne({ where: { id: product.id } });
            if (!currentProduct || Number(currentProduct.stock) <= 0) continue;

            // Get specific price
            const priceRecord = await productPriceRepository.findOne({ 
                where: { productId: product.id, customerId: customer.id } 
            });
            const unitPrice = priceRecord ? Number(priceRecord.price) : Number(product.basePrice);
            
            // Sell random amount, but not more than stock
            let quantity = Number((Math.random() * 10 + 1).toFixed(2));
            if (quantity > Number(currentProduct.stock)) {
                quantity = Number(currentProduct.stock);
            }

            const amount = Number((quantity * unitPrice).toFixed(2));

            const item = deliveryOrderItemRepository.create({
                deliveryOrderId: savedOrder.id,
                productId: product.id,
                quantity: quantity,
                unitPrice: unitPrice,
                amount: amount,
                createdAt: date,
                updatedAt: date
            });
            await deliveryOrderItemRepository.save(item);
            
            totalAmount += amount;

            // Deduct stock
            currentProduct.stock = Number(currentProduct.stock) - quantity;
            await productRepository.save(currentProduct);
        }

        // Update order total
        savedOrder.totalAmount = totalAmount;
        await deliveryOrderRepository.save(savedOrder);
    };

    // Simulate sales over last 30 days
    for (let day = 30; day >= 0; day -= 2) { // Every 2 days
        const customer = customers[Math.floor(Math.random() * customers.length)];
        await createDelivery(customer, day);
    }

    // 8. Seed Purchase Orders (Material Costs)
    console.log('Seeding Purchase Orders...');
    
    const suppliers = ['东莞五金厂', '广州塑胶原料', '深圳电子元器件', '上海钢材'];
    const materials = [
        { name: '不锈钢丝', unit: 'kg', priceRange: [20, 30] },
        { name: '塑胶粒', unit: 'kg', priceRange: [15, 25] },
        { name: '包装盒', unit: '个', priceRange: [0.5, 1.5] },
        { name: '润滑油', unit: 'L', priceRange: [50, 80] }
    ];

    for (let i = 0; i < 20; i++) {
        const daysAgo = Math.floor(Math.random() * 60);
        const date = new Date();
        date.setDate(date.getDate() - daysAgo);
        
        const material = materials[Math.floor(Math.random() * materials.length)];
        const supplier = suppliers[Math.floor(Math.random() * suppliers.length)];
        const quantity = Math.floor(Math.random() * 500) + 50; // 50-550
        const unitPrice = (Math.random() * (material.priceRange[1] - material.priceRange[0]) + material.priceRange[0]).toFixed(2);
        const amount = Number((quantity * Number(unitPrice)).toFixed(2));
        
        const po = purchaseOrderRepository.create({
            purchaseDate: date.toISOString().split('T')[0],
            item: material.name,
            supplier: supplier,
            unit: material.unit,
            quantity: quantity,
            amount: amount,
            paidAmount: Math.random() > 0.5 ? amount : 0, // 50% paid
            status: Math.random() > 0.5 ? PurchaseOrderStatus.SETTLED : PurchaseOrderStatus.PENDING,
            createdAt: date,
            updatedAt: date
        });
        
        await purchaseOrderRepository.save(po);
    }

    console.log('Real data seeded successfully!');
    console.log('Summary:');
    console.log('- Users: admin, zhangsan, lisi, wangwu created');
    console.log(`- Products: ${products.length} created with Cost/Base prices`);
    console.log(`- Customers: ${customers.length} created`);
    console.log(`- Product Prices: Matrix created for all Product-Customer pairs`);
    console.log(`- Inventory: Production data generated for last 40 days (Salary data ready)`);
    console.log(`- Delivery: Sales data generated for last 30 days`);
    console.log(`- Purchase: 20 Purchase Orders created`);

  } catch (error) {
    console.error('Error seeding real data:', error);
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

seedRealData();
