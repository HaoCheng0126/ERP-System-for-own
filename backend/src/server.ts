import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import bcrypt from 'bcrypt';
import { AppDataSource } from './config/database';
import { User, UserRole, Company, Customer, CustomerType, Product, ProductPrice } from './entities';
import authRoutes from './routes/authRoutes';
import companyRoutes from './routes/companyRoutes';
import customerRoutes from './routes/customerRoutes';
import productRoutes from './routes/productRoutes';
import inventoryRoutes from './routes/inventoryRoutes';
import salaryRoutes from './routes/salaryRoutes';
import deliveryRoutes from './routes/deliveryRoutes';
import statementRoutes from './routes/statementRoutes';
import userRoutes from './routes/userRoutes';
import purchaseRoutes from './routes/purchaseRoutes';
import dashboardRoutes from './routes/dashboardRoutes';
import paymentRoutes from './routes/paymentRoutes';
import setupRoutes from './routes/setupRoutes';
import dataQualityRoutes from './routes/dataQualityRoutes';
import returnRoutes from './routes/returnRoutes';
import settingsRoutes from './routes/settingsRoutes';
import { errorHandler } from './middlewares/errorHandler';
import { rateLimit } from './middlewares/rateLimit';

const app = express();
const PORT = process.env.PORT || 3001;
const isProduction = process.env.NODE_ENV === 'production';

// CORS：开发允许 localhost，生产限制为前端域名
const corsOptions = isProduction
  ? {
      origin: process.env.CORS_ORIGIN?.split(',') || process.env.FRONTEND_URL || [],
      credentials: true,
    }
  : {
      origin: true, // 开发环境允许所有 localhost
    };
app.use(helmet());
app.use(cors(corsOptions));
// 12mb 以容纳送货单图像识别的 base64 图片（压缩后通常 <2mb）。
app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: true, limit: '12mb' }));

// 健康检查：包含数据库连通性
app.get('/api/health', async (req, res) => {
  let database: 'ok' | 'error' = 'ok';
  try {
    if (AppDataSource.isInitialized) {
      await AppDataSource.query('SELECT 1');
    }
  } catch {
    database = 'error';
  }
  res.json({
    status: database === 'ok' ? 'ok' : 'degraded',
    message: 'Kinko API is running',
    database,
  });
});

// 限流：登录防爆破、OCR 识别防滥用（调用付费接口 + 大体积请求）
app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: '登录尝试过于频繁，请 15 分钟后再试' }));
app.use('/api/delivery/recognize', rateLimit({ windowMs: 60 * 1000, max: 10, message: '识别请求过于频繁，请稍后再试' }));

app.use('/api/auth', authRoutes);
app.use('/api/company', companyRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/products', productRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/salary', salaryRoutes);
app.use('/api/delivery', deliveryRoutes);
app.use('/api/statements', statementRoutes);
app.use('/api/users', userRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/setup', setupRoutes);
app.use('/api/data-quality', dataQualityRoutes);
app.use('/api/returns', returnRoutes);
app.use('/api/settings', settingsRoutes);
app.use(errorHandler);

async function seedInitialData() {
  const userRepository = AppDataSource.getRepository(User);
  const companyRepository = AppDataSource.getRepository(Company);
  const customerRepository = AppDataSource.getRepository(Customer);
  const productRepository = AppDataSource.getRepository(Product);
  const productPriceRepository = AppDataSource.getRepository(ProductPrice);
  const enableDemoData = process.env.ENABLE_DEMO_DATA === 'true';
  
  // 主管理员可能因旧版“修改姓名同步修改账号”的逻辑被意外改名，启动时恢复固定账号。
  const primaryAdmin = await userRepository.findOne({
    where: { code: 'SE001', role: UserRole.ADMIN },
  });
  if (primaryAdmin && primaryAdmin.username !== 'admin') {
    const adminUsernameOwner = await userRepository.findOne({ where: { username: 'admin' } });
    if (!adminUsernameOwner) {
      primaryAdmin.username = 'admin';
      await userRepository.save(primaryAdmin);
      console.log('主管理员登录账号已恢复为 admin');
    }
  }

  // 创建管理员：按角色判断，避免账号曾被改名后重复创建并触发员工编号冲突。
  const adminExists = primaryAdmin || await userRepository.findOne({ where: { role: UserRole.ADMIN } });
  if (!adminExists) {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    const codeOwner = await userRepository.findOne({ where: { code: 'SE001' } });
    const lastUser = codeOwner
      ? await userRepository
          .createQueryBuilder('user')
          .where('user.code LIKE :code', { code: 'SE%' })
          .orderBy('user.code', 'DESC')
          .getOne()
      : null;
    const nextCode = lastUser?.code
      ? `SE${String(parseInt(lastUser.code.substring(2), 10) + 1).padStart(3, '0')}`
      : 'SE001';
    const admin = userRepository.create({
      username: 'admin',
      password: hashedPassword,
      name: '系统管理员',
      role: UserRole.ADMIN,
      code: nextCode,
    });
    await userRepository.save(admin);
    console.log(`初始管理员账户已创建: admin / admin123 (${nextCode})`);
  }

  if (!enableDemoData) {
    console.log('示例数据未启用，真实账套仅保留必要管理员账户');
    return;
  }

  // 创建计件员工
  const employeeExists = await userRepository.findOne({ where: { username: 'zhangsan' } });
  if (!employeeExists) {
    const hashedPassword = await bcrypt.hash('123456', 10);
    const employee = userRepository.create({
      username: 'zhangsan',
      password: hashedPassword,
      name: '张三',
      role: UserRole.PIECE_RATE,
      phone: '13800138000',
      code: 'SE002',
    });
    await userRepository.save(employee);
    console.log('计件员工账户已创建: zhangsan / 123456 (SE002)');
  }

  // 创建公司资料
  const companyExists = await companyRepository.findOne({ where: {} });
  if (!companyExists) {
    const company = companyRepository.create({
      name: 'Kinko 制造有限公司',
      address: '深圳市南山区科技园南区',
      contactPerson: '李经理',
      phone: '0755-88888888',
    });
    await companyRepository.save(company);
    console.log('公司资料已创建');
  }

  // 创建客户
  const customerCount = await customerRepository.count();
  if (customerCount === 0) {
    const customers = [
      { name: '深圳电子有限公司', address: '深圳市福田区', contactPerson: '王总', phone: '13900139001' },
      { name: '广州科技有限公司', address: '广州市天河区', contactPerson: '陈总', phone: '13900139002' },
      { name: '东莞贸易公司', address: '东莞市莞城区', contactPerson: '刘总', phone: '13900139003' },
    ];
    
    for (let i = 0; i < customers.length; i++) {
      const customer = customerRepository.create({
        ...customers[i],
        code: String(i + 1).padStart(3, '0'),
      });
      await customerRepository.save(customer);
    }
    console.log('示例客户已创建');
  }

  // 创建产品
  const productCount = await productRepository.count();
  if (productCount === 0) {
    const products = [
      { name: 'SmA-丁针', specification: 'Jo3-8.3503', unit: '100个', costPrice: 0.2, basePrice: 0.3 },
      { name: 'SmB-丁针', specification: 'Jo3-8.3504', unit: '100个', costPrice: 0.25, basePrice: 0.38 },
      { name: 'SmC-丁针', specification: 'Jo3-8.3505', unit: '100个', costPrice: 0.18, basePrice: 0.28 },
      { name: '端子A', specification: 'TER-001', unit: '个', costPrice: 0.05, basePrice: 0.08 },
      { name: '端子B', specification: 'TER-002', unit: '个', costPrice: 0.06, basePrice: 0.1 },
    ];
    
    for (const productData of products) {
      const product = productRepository.create(productData);
      await productRepository.save(product);
    }
    console.log('示例产品已创建');
  }

  const productPriceCount = await productPriceRepository.count();
  if (productPriceCount === 0) {
    const firstClient = await customerRepository.findOne({ where: { type: CustomerType.CLIENT } });
    const products = await productRepository.find();
    if (firstClient && products.length > 0) {
      for (const product of products) {
        const price = productPriceRepository.create({
          productId: product.id,
          customerId: firstClient.id,
          price: Number(product.basePrice || 0),
        });
        await productPriceRepository.save(price);
      }
      console.log('示例客户价格已创建');
    }
  }
}

const WEAK_JWT_SECRETS = [
  'secret',
  'your-super-secret-jwt-key-change-in-production',
  'change-this-in-production',
];

// 任何环境都执行：生产强制要求强随机 JWT_SECRET；非生产若缺失则生成一次性随机值，
// 绝不回退到可猜测的固定字符串（旧代码硬编码的 'secret' 可被用来伪造管理员 token）。
function ensureJwtSecret() {
  const secret = process.env.JWT_SECRET;
  const isWeak = !secret || WEAK_JWT_SECRETS.includes(secret);
  if (isProduction) {
    if (isWeak) {
      console.error('错误: 生产环境必须设置强随机的 JWT_SECRET（不能为空或使用默认值）。请在 .env 中配置。');
      process.exit(1);
    }
    return;
  }
  if (!secret) {
    process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
    console.warn('警告: 未设置 JWT_SECRET，已为本次运行生成随机密钥（重启后登录态会失效）。建议在 .env 配置固定值。');
  }
}

async function bootstrap() {
  try {
    ensureJwtSecret();
    await AppDataSource.initialize();
    console.log('Database connected successfully');

    await seedInitialData();

    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

bootstrap();
