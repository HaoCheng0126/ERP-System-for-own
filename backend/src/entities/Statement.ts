import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from '../lib/typeorm';
import { Customer } from './Customer';
import { ColumnNumericTransformer } from '../utils/transformers';

export enum StatementPeriod {
  WEEKLY = 'weekly',
  BIWEEKLY = 'biweekly',
  MONTHLY = 'monthly',
}

@Entity('statements')
export class Statement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  customerId: string;

  @Column({
    type: 'enum',
    enum: StatementPeriod,
  })
  period: StatementPeriod;

  @Column({ type: 'date' })
  startDate: string;

  @Column({ type: 'date' })
  endDate: string;
  @Column('decimal', { precision: 12, scale: 2, transformer: new ColumnNumericTransformer() })
  totalAmount: number;

  @Column({ type: 'text', nullable: true })
  remark: string;

  @ManyToOne(() => Customer)
  @JoinColumn({ name: 'customerId' })
  customer: Customer;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
