import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from '../lib/typeorm';

@Entity('setup_states')
export class SetupState {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  completedBy: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
