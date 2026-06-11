import type { MigrationInterface, QueryRunner } from '../lib/typeorm';

export class AddStatementFieldsToCompany1788700000000 implements MigrationInterface {
  name = 'AddStatementFieldsToCompany1788700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "companies" ADD "statementTaxLabel" character varying`);
    await queryRunner.query(`ALTER TABLE "companies" ADD "statementSettlementLabel" character varying`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "companies" DROP COLUMN "statementSettlementLabel"`);
    await queryRunner.query(`ALTER TABLE "companies" DROP COLUMN "statementTaxLabel"`);
  }
}
