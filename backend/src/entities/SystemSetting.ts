import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from '../lib/typeorm';

// 通用的「键-值」系统配置存储（如图像识别服务的密钥/端点/模型）。
// 注意：value 可能存放敏感信息（API Key），仅在服务端使用，不回显给前端。
@Entity('system_settings')
export class SystemSetting {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  key: string;

  @Column({ type: 'text', nullable: true })
  value: string | null;

  @UpdateDateColumn()
  updatedAt: Date;
}
