import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReturnItemDeductionCount1796600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "return_order_items"
        ADD COLUMN IF NOT EXISTS "deductionCount" INT NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "return_order_items" DROP COLUMN IF EXISTS "deductionCount"`);
  }
}
