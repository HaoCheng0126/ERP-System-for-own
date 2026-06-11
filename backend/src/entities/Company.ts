import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from '../lib/typeorm';

@Entity('companies')
export class Company {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true })
  contactPerson: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  statementTaxLabel: string;

  @Column({ nullable: true })
  statementSettlementLabel: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
