import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from '../lib/typeorm';
import { DeliveryOrder } from './DeliveryOrder';
import { Product } from './Product';
import { ColumnNumericTransformer } from '../utils/transformers';

@Entity('delivery_order_items')
export class DeliveryOrderItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  deliveryOrderId: string;

  @Column()
  productId: string;

  @Column('decimal', { precision: 12, scale: 4, transformer: new ColumnNumericTransformer() })
  quantity: number;

  @Column('decimal', { precision: 12, scale: 4, transformer: new ColumnNumericTransformer() })
  unitPrice: number;

  @Column('decimal', { precision: 12, scale: 4, transformer: new ColumnNumericTransformer() })
  amount: number;

  @ManyToOne(() => DeliveryOrder, (order) => order.items)
  @JoinColumn({ name: 'deliveryOrderId' })
  deliveryOrder: DeliveryOrder;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'productId' })
  product: Product;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
