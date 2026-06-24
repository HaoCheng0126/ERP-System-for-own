import 'dotenv/config';
import { DataSource } from '../lib/typeorm';
import { User } from '../entities/User';
import { Company } from '../entities/Company';
import { Customer } from '../entities/Customer';
import { Product } from '../entities/Product';
import { ProductPrice } from '../entities/ProductPrice';
import { InventoryRecord } from '../entities/InventoryRecord';
import { DeliveryOrder } from '../entities/DeliveryOrder';
import { DeliveryOrderItem } from '../entities/DeliveryOrderItem';
import { Statement } from '../entities/Statement';
import { PurchaseOrder } from '../entities/PurchaseOrder';
import { PaymentRecord } from '../entities/PaymentRecord';
import { SetupState } from '../entities/SetupState';
import { StockAdjustment } from '../entities/StockAdjustment';
import { ReturnOrder } from '../entities/ReturnOrder';
import { ReturnOrderItem } from '../entities/ReturnOrderItem';
import { SystemSetting } from '../entities/SystemSetting';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_DATABASE || 'kinko',
  synchronize: process.env.NODE_ENV !== 'production',
  logging: process.env.NODE_ENV !== 'production',
  entities: [
    User,
    Company,
    Customer,
    Product,
    ProductPrice,
    InventoryRecord,
    DeliveryOrder,
    DeliveryOrderItem,
    Statement,
    PurchaseOrder,
    PaymentRecord,
    SetupState,
    StockAdjustment,
    ReturnOrder,
    ReturnOrderItem,
    SystemSetting,
  ],
  migrations: [__dirname + '/../migrations/*.{ts,js}'],
  subscribers: [],
});
