import type { MigrationInterface, QueryRunner } from '../lib/typeorm';

export class WidenProductStockScale1796000000000 implements MigrationInterface {
  name = 'WidenProductStockScale1796000000000';

  // 库存精度由 numeric(10,2) 提升到 numeric(12,4)，与数量列同精度。
  // 扩大精度是无损操作，已有库存值原样保留。
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "stock" TYPE numeric(12,4)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "stock" TYPE numeric(10,2)`);
  }
}
