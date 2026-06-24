import { Entity, Index, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from '../lib/typeorm';
import { ColumnNumericTransformer } from '../utils/transformers';
import { Customer } from './Customer';
import { Product } from './Product';

export enum PurchaseOrderStatus {
  PENDING = 'pending',
  SETTLED = 'settled',
  PARTIAL = 'partial',
}

@Entity('purchase_orders')
@Index(['supplierId', 'purchaseDate'])
@Index(['productId'])
export class PurchaseOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'date' })
  purchaseDate: string;

  @Column({ nullable: true })
  supplierId: string | null;

  @Column({ nullable: true })
  productId: string | null;

  @Column()
  item: string;

  @Column()
  supplier: string;

  @Column()
  unit: string;

  @Column('decimal', { precision: 12, scale: 4, transformer: new ColumnNumericTransformer() })
  quantity: number;

  @Column('decimal', { precision: 12, scale: 4, default: 0, transformer: new ColumnNumericTransformer() })
  unitPrice: number;

  @Column('decimal', { precision: 12, scale: 4, transformer: new ColumnNumericTransformer() })
  amount: number;

  @Column('decimal', { precision: 12, scale: 4, default: 0, transformer: new ColumnNumericTransformer() })
  paidAmount: number;

  @Column({ default: false })
  stockApplied: boolean;

  @Column({
    type: 'enum',
    enum: PurchaseOrderStatus,
    default: PurchaseOrderStatus.PENDING,
  })
  status: PurchaseOrderStatus;

  @Column({ type: 'text', nullable: true })
  remark?: string | null;

  @ManyToOne(() => Customer, { nullable: true })
  @JoinColumn({ name: 'supplierId' })
  supplierEntity?: Customer | null;

  @ManyToOne(() => Product, { nullable: true })
  @JoinColumn({ name: 'productId' })
  product?: Product | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
