import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from '../lib/typeorm';
import { ColumnNumericTransformer } from '../utils/transformers';

export enum CustomerType {
  CLIENT = 'Client',
  SUPPLIER = 'Supplier',
}

@Entity('customers')
export class Customer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  code: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true })
  contactPerson: string;

  @Column({ nullable: true })
  phone: string;

  @Column('decimal', {
    precision: 12,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  initialBalance: number;

  @Column({ nullable: true })
  group: string;

  @Column({
    type: 'enum',
    enum: CustomerType,
    default: CustomerType.CLIENT,
  })
  type: CustomerType;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
