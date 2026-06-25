import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from '../lib/typeorm';
import { User } from './User';
import { ReturnOrder } from './ReturnOrder';
import { ColumnNumericTransformer } from '../utils/transformers';

@Entity('salary_deductions')
@Index(['employeeId'])
@Index(['deductionDate'])
export class SalaryDeduction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  employeeId: string;

  // 'return' | 'leave' | 'other'
  @Column({ length: 20, default: 'other' })
  type: string;

  @Column('decimal', { precision: 12, scale: 4, transformer: new ColumnNumericTransformer() })
  amount: number;

  @Column('decimal', { precision: 12, scale: 4, nullable: true, transformer: new ColumnNumericTransformer() })
  quantity: number | null;

  @Column('decimal', { precision: 12, scale: 4, nullable: true, transformer: new ColumnNumericTransformer() })
  unitPrice: number | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'uuid', nullable: true })
  returnOrderId: string | null;

  @Column({ type: 'date' })
  deductionDate: string;

  @Column()
  createdBy: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'employeeId' })
  employee: User;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'createdBy' })
  creator: User;

  @ManyToOne(() => ReturnOrder, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'returnOrderId' })
  returnOrder: ReturnOrder | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
