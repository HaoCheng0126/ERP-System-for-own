import type { MigrationInterface, QueryRunner } from '../lib/typeorm';

export class AddInventorySubmissionMode1785600000000 implements MigrationInterface {
  name = 'AddInventorySubmissionMode1785600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "inventory_records_submissionmode_enum" AS ENUM ('employee_submit', 'admin_assign')`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_records" ADD "submissionMode" "inventory_records_submissionmode_enum" NOT NULL DEFAULT 'employee_submit'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "inventory_records" DROP COLUMN "submissionMode"`);
    await queryRunner.query(`DROP TYPE "inventory_records_submissionmode_enum"`);
  }
}
