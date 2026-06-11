import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany } from '../lib/typeorm';
import { Customer } from './Customer';
import { DeliveryOrderItem } from './DeliveryOrderItem';
import { ColumnNumericTransformer } from '../utils/transformers';

export enum DeliveryOrderStatus {
  PENDING = 'pending',
  SETTLED = 'settled',
  PARTIAL = 'partial',
}

@Entity('delivery_orders')
export class DeliveryOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: DeliveryOrderStatus,
    default: DeliveryOrderStatus.PENDING,
  })
  status: DeliveryOrderStatus;

  @Column({ unique: true })
  orderNumber: string;

  @Column()
  customerId: string;

  @Column({ type: 'date' })
  deliveryDate: string;

  @Column('decimal', { precision: 12, scale: 2, default: 0, transformer: new ColumnNumericTransformer() })
  totalAmount: number;

  @Column('decimal', { precision: 12, scale: 2, default: 0, transformer: new ColumnNumericTransformer() })
  paidAmount: number;

  @Column({ type: 'text', nullable: true })
  remark: string;

  @ManyToOne(() => Customer)
  @JoinColumn({ name: 'customerId' })
  customer: Customer;

  @OneToMany(() => DeliveryOrderItem, (item) => item.deliveryOrder, { cascade: true })
  items: DeliveryOrderItem[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
