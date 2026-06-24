import { Entity, Index, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from '../lib/typeorm';
import { User } from './User';
import { Product } from './Product';
import { ColumnNumericTransformer } from '../utils/transformers';

export enum InventoryRecordStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export enum InventoryRecordSubmissionMode {
  EMPLOYEE_SUBMIT = 'employee_submit',
  ADMIN_ASSIGN = 'admin_assign',
  RETURN_DEDUCTION = 'return_deduction',
}

@Entity('inventory_records')
@Index(['submittedBy', 'createdAt'])
@Index(['status'])
@Index(['productId'])
export class InventoryRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, nullable: true })
  recordNumber: string;

  @Column()
  productId: string;

  @Column()
  submittedBy: string;

  @Column({ nullable: true })
  reviewedBy: string | null;

  @Column('decimal', { precision: 12, scale: 4, transformer: new ColumnNumericTransformer() })
  quantity: number;

  @Column('decimal', { precision: 12, scale: 4, transformer: new ColumnNumericTransformer() })
  unitPrice: number;

  @Column('decimal', { precision: 12, scale: 4, transformer: new ColumnNumericTransformer() })
  totalAmount: number;

  @Column({
    type: 'enum',
    enum: InventoryRecordStatus,
    default: InventoryRecordStatus.PENDING,
  })
  status: InventoryRecordStatus;

  @Column({
    type: 'enum',
    enum: InventoryRecordSubmissionMode,
    default: InventoryRecordSubmissionMode.EMPLOYEE_SUBMIT,
  })
  submissionMode: InventoryRecordSubmissionMode;

  @Column({ type: 'text', nullable: true })
  remark: string | null;

  @Column({ type: 'timestamp', nullable: true })
  reviewedAt: Date | null;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'productId' })
  product: Product;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'submittedBy' })
  submitter: User;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'reviewedBy' })
  reviewer: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
