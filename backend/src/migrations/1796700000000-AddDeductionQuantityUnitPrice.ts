import { MigrationInterface, QueryRunner } from '../lib/typeorm';

export class AddDeductionQuantityUnitPrice1796700000000 implements MigrationInterface {
  name = 'AddDeductionQuantityUnitPrice1796700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "salary_deductions" ADD COLUMN IF NOT EXISTS "quantity" DECIMAL(12,4) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "salary_deductions" ADD COLUMN IF NOT EXISTS "unitPrice" DECIMAL(12,4) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "salary_deductions" DROP COLUMN IF EXISTS "unitPrice"`);
    await queryRunner.query(`ALTER TABLE "salary_deductions" DROP COLUMN IF EXISTS "quantity"`);
  }
}
