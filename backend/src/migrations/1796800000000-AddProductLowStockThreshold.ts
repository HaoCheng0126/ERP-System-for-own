import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductLowStockThreshold1796800000000 implements MigrationInterface {
  name = 'AddProductLowStockThreshold1796800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "lowStockThreshold" decimal(12,4)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "lowStockThreshold"`);
  }
}
