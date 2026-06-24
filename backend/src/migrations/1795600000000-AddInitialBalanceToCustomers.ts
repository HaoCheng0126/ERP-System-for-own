import type { MigrationInterface, QueryRunner } from '../lib/typeorm';

export class AddInitialBalanceToCustomers1795600000000 implements MigrationInterface {
  name = 'AddInitialBalanceToCustomers1795600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "customers"
      ADD COLUMN "initialBalance" numeric(12,2) NOT NULL DEFAULT 0
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "customers"
      DROP COLUMN "initialBalance"
    `);
  }
}
