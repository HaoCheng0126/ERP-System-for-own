import { Entity, Index, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from '../lib/typeorm';
import { Customer } from './Customer';
import { ColumnNumericTransformer } from '../utils/transformers';

export enum PaymentMethod {
  PUBLIC_CASH = 'Public_Cash',
  PUBLIC_ACCEPTANCE = 'Public_Acceptance',
  PRIVATE_ALIPAY = 'Private_Alipay',
  PRIVATE_WECHAT = 'Private_Wechat',
  PRIVATE_CARD = 'Private_Card',
}

@Entity('payment_records')
@Index(['customerId', 'paymentDate'])
export class PaymentRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  customerId: string;

  @Column('decimal', { precision: 12, scale: 2, transformer: new ColumnNumericTransformer() })
  amount: number;

  @Column({ type: 'date' })
  paymentDate: Date;

  @Column({
    type: 'enum',
    enum: PaymentMethod,
  })
  method: PaymentMethod;

  @Column({ type: 'text', nullable: true })
  remarks: string;

  @ManyToOne(() => Customer)
  @JoinColumn({ name: 'customerId' })
  customer: Customer;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
