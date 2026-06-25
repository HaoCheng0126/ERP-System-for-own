import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from '../lib/typeorm';
import { ProductPrice } from './ProductPrice';
import { ColumnNumericTransformer } from '../utils/transformers';

export enum ProductType {
  FINISHED = 'finished',
  RAW_MATERIAL = 'raw_material',
}

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  specification: string;

  @Column()
  unit: string;

  @Column({
    type: 'enum',
    enum: ProductType,
    default: ProductType.FINISHED,
  })
  type: ProductType;

  @Column('decimal', { precision: 12, scale: 4, default: 0, transformer: new ColumnNumericTransformer() })
  costPrice: number;

  @Column('decimal', { precision: 12, scale: 4, nullable: true, transformer: new ColumnNumericTransformer() })
  basePrice: number | null;

  // 库存与数量同精度（4 位小数）：避免数量为 4 位小数时入库/出库后库存被截断到 2 位，
  // 导致存储值与 scale-4 的负库存校验/回退计算不一致。
  @Column('decimal', { precision: 12, scale: 4, default: 0, transformer: new ColumnNumericTransformer() })
  stock: number;

  // 安全库存阈值：库存 ≤ 此值即触发仪表盘「库存预警」。为空表示不预警。
  @Column('decimal', { precision: 12, scale: 4, nullable: true, transformer: new ColumnNumericTransformer() })
  lowStockThreshold: number | null;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => ProductPrice, (productPrice) => productPrice.product)
  productPrices: ProductPrice[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
