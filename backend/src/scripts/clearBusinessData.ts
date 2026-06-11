import 'reflect-metadata';
import { AppDataSource } from '../config/database';
import { 
  User, 
  Product, 
  InventoryRecord, 
  Customer, 
  ProductPrice, 
  DeliveryOrder, 
  DeliveryOrderItem, 
  PurchaseOrder,
  Statement
} from '../entities';

async function clearBusinessData() {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    console.log('Database connected');

    const inventoryRepository = AppDataSource.getRepository(InventoryRecord);
    const productRepository = AppDataSource.getRepository(Product);
    const customerRepository = AppDataSource.getRepository(Customer);
    const productPriceRepository = AppDataSource.getRepository(ProductPrice);
    const deliveryOrderRepository = AppDataSource.getRepository(DeliveryOrder);
    const deliveryOrderItemRepository = AppDataSource.getRepository(DeliveryOrderItem);
    const purchaseOrderRepository = AppDataSource.getRepository(PurchaseOrder);
    const statementRepository = AppDataSource.getRepository(Statement);

    console.log('Clearing business data (keeping User accounts)...');
    
    // Order matters due to Foreign Keys
    // 1. Delete items that depend on Orders/Products
    console.log('- Deleting Delivery Order Items...');
    await deliveryOrderItemRepository.createQueryBuilder().delete().execute();
    
    console.log('- Deleting Product Prices...');
    await productPriceRepository.createQueryBuilder().delete().execute();
    
    console.log('- Deleting Inventory Records...');
    await inventoryRepository.createQueryBuilder().delete().execute();

    console.log('- Deleting Statements...');
    await statementRepository.createQueryBuilder().delete().execute();

    // 2. Delete Orders (depends on Customers)
    console.log('- Deleting Delivery Orders...');
    await deliveryOrderRepository.createQueryBuilder().delete().execute();
    
    console.log('- Deleting Purchase Orders...');
    await purchaseOrderRepository.createQueryBuilder().delete().execute();

    // 3. Delete Products and Customers
    console.log('- Deleting Products...');
    await productRepository.createQueryBuilder().delete().execute();
    
    console.log('- Deleting Customers...');
    await customerRepository.createQueryBuilder().delete().execute();

    console.log('All business data cleared successfully!');
    console.log('User accounts preserved.');

  } catch (error) {
    console.error('Error clearing data:', error);
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

clearBusinessData();
