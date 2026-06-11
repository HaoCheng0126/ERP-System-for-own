import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from '../lib/typeorm';
import { ProductPrice } from './ProductPrice';
import { ColumnNumericTransformer } from '../utils/transformers';

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

  @Column('decimal', { precision: 12, scale: 4, default: 0, transformer: new ColumnNumericTransformer() })
  costPrice: number;

  @Column('decimal', { precision: 12, scale: 4, nullable: true, transformer: new ColumnNumericTransformer() })
  basePrice: number | null;

  @Column('decimal', { precision: 10, scale: 2, default: 0, transformer: new ColumnNumericTransformer() })
  stock: number;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => ProductPrice, (productPrice) => productPrice.product)
  productPrices: ProductPrice[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
