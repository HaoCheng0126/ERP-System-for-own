import type { MigrationInterface, QueryRunner } from '../lib/typeorm';

export class AddRejectionReason1796400000000 implements MigrationInterface {
  name = 'AddRejectionReason1796400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "inventory_records" ADD COLUMN IF NOT EXISTS "rejectionReason" text`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "inventory_records" DROP COLUMN IF EXISTS "rejectionReason"`,
    );
  }
}
