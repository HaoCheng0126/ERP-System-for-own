import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from '../lib/typeorm';
import { Product } from './Product';
import { User } from './User';
import { ColumnNumericTransformer } from '../utils/transformers';

export enum StockAdjustmentReason {
  MANUAL_CORRECTION = 'manual_correction',
}

@Entity('stock_adjustments')
export class StockAdjustment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  productId: string;

  @Column({ type: 'uuid', nullable: true })
  adjustedBy: string | null;

  @Column('decimal', { precision: 12, scale: 4, transformer: new ColumnNumericTransformer() })
  previousStock: number;

  @Column('decimal', { precision: 12, scale: 4, transformer: new ColumnNumericTransformer() })
  deltaQuantity: number;

  @Column('decimal', { precision: 12, scale: 4, transformer: new ColumnNumericTransformer() })
  nextStock: number;

  @Column({
    type: 'enum',
    enum: StockAdjustmentReason,
    default: StockAdjustmentReason.MANUAL_CORRECTION,
  })
  reason: StockAdjustmentReason;

  @Column({ type: 'text', nullable: true })
  remark: string | null;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'productId' })
  product: Product;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'adjustedBy' })
  adjuster: User | null;

  @CreateDateColumn()
  createdAt: Date;
}
