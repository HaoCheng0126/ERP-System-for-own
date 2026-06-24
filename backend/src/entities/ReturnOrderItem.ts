import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from '../lib/typeorm';
import { ReturnOrder } from './ReturnOrder';
import { Product } from './Product';
import { ColumnNumericTransformer } from '../utils/transformers';

// 退货明细。restock 决定退回的货是否加回成品库存；deductEmployeeId 非空表示质量问题、
// 要扣对应员工的计件工资（记一条负数入库单，其 id 存入 deductInventoryRecordId 便于反向）。
@Entity('return_order_items')
export class ReturnOrderItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  returnOrderId: string;

  @Column()
  productId: string;

  @Column('decimal', { precision: 12, scale: 4, transformer: new ColumnNumericTransformer() })
  quantity: number;

  @Column('decimal', { precision: 12, scale: 4, transformer: new ColumnNumericTransformer() })
  unitPrice: number;

  @Column('decimal', { precision: 12, scale: 4, transformer: new ColumnNumericTransformer() })
  amount: number;

  @Column({ default: true })
  restock: boolean;

  @Column({ type: 'uuid', nullable: true })
  deductEmployeeId: string | null;

  @Column('decimal', { precision: 12, scale: 4, default: 0, transformer: new ColumnNumericTransformer() })
  deductQuantity: number;

  @Column({ type: 'uuid', nullable: true })
  deductInventoryRecordId: string | null;

  @ManyToOne(() => ReturnOrder, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'returnOrderId' })
  returnOrder: ReturnOrder;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'productId' })
  product: Product;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
