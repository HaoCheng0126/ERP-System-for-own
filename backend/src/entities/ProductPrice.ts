import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Unique } from '../lib/typeorm';
import { Product } from './Product';
import { Customer } from './Customer';
import { ColumnNumericTransformer } from '../utils/transformers';

@Entity('product_prices')
@Unique(['productId', 'customerId'])
export class ProductPrice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  productId: string;

  @Column()
  customerId: string;

  @Column('decimal', { precision: 12, scale: 4, transformer: new ColumnNumericTransformer() })
  price: number;

  @ManyToOne(() => Product, (product) => product.productPrices)
  @JoinColumn({ name: 'productId' })
  product: Product;

  @ManyToOne(() => Customer)
  @JoinColumn({ name: 'customerId' })
  customer: Customer;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
