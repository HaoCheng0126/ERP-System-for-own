// 用户类型
export enum UserRole {
  PIECE_RATE = 'piece_rate',
  ADMIN = 'admin',
}

export interface User {
  id: string;
  username: string;
  code?: string;
  password?: string;
  passwordStatus?: 'default' | 'changed';
  name: string;
  role: UserRole;
  phone?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// 公司类型
export interface Company {
  id: string;
  name: string;
  address?: string;
  contactPerson?: string;
  phone?: string;
  statementTaxLabel?: string;
  statementSettlementLabel?: string;
  createdAt: string;
  updatedAt: string;
}

// 产品类型
export enum ProductType {
  FINISHED = 'finished',
  RAW_MATERIAL = 'raw_material',
}

export interface Product {
  id: string;
  name: string;
  specification: string;
  unit: string;
  type: ProductType;
  costPrice: number;
  basePrice?: number;
  stock?: number;
  isActive: boolean;
  productPrices?: ProductPrice[];
  createdAt: string;
  updatedAt: string;
}

// 产品价格类型
export interface ProductPrice {
  id: string;
  productId: string;
  customerId: string;
  price: number;
  product?: Product;
  customer?: Customer;
  createdAt: string;
  updatedAt: string;
}

// 客户类型
export enum CustomerType {
  CLIENT = 'Client',
  SUPPLIER = 'Supplier',
}

export interface Customer {
  id: string;
  code: string;
  name: string;
  address?: string;
  contactPerson?: string;
  phone?: string;
  initialBalance?: number;
  group?: string;
  type: CustomerType;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// 入库单状态
export enum InventoryRecordStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export enum InventoryRecordSubmissionMode {
  EMPLOYEE_SUBMIT = 'employee_submit',
  ADMIN_ASSIGN = 'admin_assign',
  RETURN_DEDUCTION = 'return_deduction',
}

// 入库单类型
export interface InventoryRecord {
  id: string;
  recordNumber?: string;
  productId: string;
  submittedBy: string;
  reviewedBy?: string | null;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  status: InventoryRecordStatus;
  submissionMode: InventoryRecordSubmissionMode;
  remark?: string | null;
  reviewedAt?: string | null;
  product?: Product;
  submitter?: User;
  reviewer?: User;
  createdAt: string;
  updatedAt: string;
}

// 送货单商品类型
export interface DeliveryOrderItem {
  id: string;
  deliveryOrderId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  product?: Product;
}

// 送货单状态
export enum DeliveryOrderStatus {
  PENDING = 'pending',
  SETTLED = 'settled',
  PARTIAL = 'partial',
}

// 送货单类型
export interface DeliveryOrder {
  id: string;
  orderNumber: string;
  customerId: string;
  deliveryDate: string;
  totalAmount: number;
  paidAmount?: number;
  stockDeducted?: boolean;
  status: DeliveryOrderStatus;
  remark?: string;
  customer?: Customer;
  items: DeliveryOrderItem[];
  createdAt: string;
  updatedAt: string;
}

// 对账单周期
export enum StatementPeriod {
  WEEKLY = 'weekly',
  BIWEEKLY = 'biweekly',
  MONTHLY = 'monthly',
}

// 对账单类型
export interface Statement {
  id: string;
  customerId: string;
  period: StatementPeriod;
  startDate: string;
  endDate: string;
  totalAmount: number;
  remark?: string;
  customer?: Customer;
  createdAt: string;
  updatedAt: string;
}

// 登录请求类型
export enum PaymentMethod {
  PUBLIC_CASH = 'Public_Cash',
  PUBLIC_ACCEPTANCE = 'Public_Acceptance',
  PRIVATE_ALIPAY = 'Private_Alipay',
  PRIVATE_WECHAT = 'Private_Wechat',
  PRIVATE_CARD = 'Private_Card',
}

export interface PaymentRecord {
  id: string;
  customerId: string;
  amount: number;
  paymentDate: string;
  method: PaymentMethod;
  remarks?: string;
  customer?: Customer;
  createdAt: string;
  updatedAt: string;
}

export interface LoginRequest {
  account: string;
  password: string;
}

// 登录响应类型
export interface LoginResponse {
  message: string;
  token: string;
  user: User;
}

// 工资报表类型
export interface SalaryReportItem {
  user: User;
  totalAmount: number;
  totalQuantity: number;
  records: InventoryRecord[];
}

export interface SalaryReport {
  report: SalaryReportItem[];
  summary: {
    totalRecords: number;
    totalAmount: number;
    totalQuantity: number;
  };
}

// 进货单状态
export enum PurchaseOrderStatus {
  PENDING = 'pending',
  SETTLED = 'settled',
  PARTIAL = 'partial',
}

// 进货单类型
export interface PurchaseOrder {
  id: string;
  purchaseDate: string;
  supplierId?: string | null;
  productId?: string | null;
  item: string;
  supplier: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  paidAmount?: number;
  stockApplied?: boolean;
  status?: PurchaseOrderStatus;
  remark?: string;
  supplierEntity?: Customer | null;
  product?: Product | null;
  createdAt: string;
  updatedAt: string;
}

// 客户退货单
export interface ReturnOrderItem {
  id: string;
  returnOrderId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  restock: boolean;
  deductEmployeeId?: string | null;
  deductQuantity: number;
  deductInventoryRecordId?: string | null;
  product?: Product;
}

export interface ReturnOrder {
  id: string;
  returnNumber: string;
  customerId: string;
  deliveryOrderId?: string | null;
  returnDate: string;
  totalAmount: number;
  remark?: string | null;
  customer?: Customer;
  deliveryOrder?: DeliveryOrder | null;
  items: ReturnOrderItem[];
  createdAt: string;
  updatedAt: string;
}

export type StatementBusinessMode = 'delivery' | 'purchase';

export interface ReconciliationGroup {
  customer: Customer;
  mode: StatementBusinessMode;
  orders: DeliveryOrder[];
  purchases: PurchaseOrder[];
  payments: PaymentRecord[];
  returns?: ReturnOrder[];
  totalBusiness: number;
  totalPayment: number;
  endingBalance: number;
  periodBusiness: number;
  periodPayment: number;
}

export interface DashboardFinancialStats {
  salesAmount: number;
  receivedAmount: number;
  receivableBalance: number;
  purchaseAmount: number;
  paidAmount: number;
  payableBalance: number;
}

export interface CounterpartyStat {
  id: string;
  name: string;
  type: CustomerType;
  totalBusiness: number;
  totalPayment: number;
  endingBalance: number;
  statusLabel: string;
}

export interface DashboardCounterpartyStats {
  clients: CounterpartyStat[];
  suppliers: CounterpartyStat[];
}

export interface DashboardTrendPoint {
  month: string;
  label: string;
  sales: number;
  purchase: number;
}

export interface DashboardRecentRecord {
  id: string;
  recordNumber: string;
  submitterName: string;
  productName: string;
  quantity: number;
  status: string;
  createdAt: string;
}

export interface DashboardAdminStats {
  todayInventoryCount: number;
  todayGrowthRate: number;
  pendingReviewCount: number;
  currentMonthOutputValue: number;
  monthGrowthRate: number;
  activeCustomerCount: number;
  recentRecords: DashboardRecentRecord[];
}
