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
export interface Product {
  id: string;
  name: string;
  specification: string;
  unit: string;
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
  item: string;
  supplier: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  paidAmount?: number;
  status?: PurchaseOrderStatus;
  remark?: string;
  supplierEntity?: Customer | null;
  createdAt: string;
  updatedAt: string;
}
