import { Entity, Index, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany } from '../lib/typeorm';
import { Customer } from './Customer';
import { DeliveryOrder } from './DeliveryOrder';
import { ReturnOrderItem } from './ReturnOrderItem';
import { ColumnNumericTransformer } from '../utils/transformers';

// 客户退货单（红冲送货）。totalAmount 为正数（本次贷记金额），在对账里按「负的业务」冲减应收。
@Entity('return_orders')
@Index(['customerId'])
export class ReturnOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  returnNumber: string;

  @Column()
  customerId: string;

  @Column({ type: 'uuid', nullable: true })
  deliveryOrderId: string | null;

  @Column({ type: 'date' })
  returnDate: string;

  @Column('decimal', { precision: 12, scale: 2, default: 0, transformer: new ColumnNumericTransformer() })
  totalAmount: number;

  @Column({ type: 'text', nullable: true })
  remark: string | null;

  @ManyToOne(() => Customer)
  @JoinColumn({ name: 'customerId' })
  customer: Customer;

  @ManyToOne(() => DeliveryOrder, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'deliveryOrderId' })
  deliveryOrder?: DeliveryOrder | null;

  @OneToMany(() => ReturnOrderItem, (item) => item.returnOrder, { cascade: true })
  items: ReturnOrderItem[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
