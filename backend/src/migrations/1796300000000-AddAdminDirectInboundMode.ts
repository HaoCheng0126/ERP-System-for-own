import type { MigrationInterface, QueryRunner } from '../lib/typeorm';

// 入库单来源枚举新增「直接入库」(admin_direct)：管理员只入库存、不计任何员工工资，
// 但会在入库单管理里留一条已通过、工价 0 的记录，便于审计与删除纠错。
export class AddAdminDirectInboundMode1796300000000 implements MigrationInterface {
  name = 'AddAdminDirectInboundMode1796300000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "inventory_records_submissionmode_enum" ADD VALUE IF NOT EXISTS 'admin_direct'`,
    );
  }

  async down(): Promise<void> {
    // Postgres 不支持删除枚举值；保留即可，无副作用。
  }
}
