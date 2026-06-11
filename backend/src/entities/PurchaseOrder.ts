import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from '../lib/typeorm';
import { ColumnNumericTransformer } from '../utils/transformers';
import { Customer } from './Customer';

export enum PurchaseOrderStatus {
  PENDING = 'pending',
  SETTLED = 'settled',
  PARTIAL = 'partial',
}

@Entity('purchase_orders')
export class PurchaseOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'date' })
  purchaseDate: string;

  @Column({ nullable: true })
  supplierId: string | null;

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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
