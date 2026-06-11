import type { MigrationInterface, QueryRunner } from '../lib/typeorm';

export class AddSetupState1793000000000 implements MigrationInterface {
  name = 'AddSetupState1793000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "setup_states" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "completedAt" TIMESTAMP,
        "completedBy" character varying,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_setup_states" PRIMARY KEY ("id")
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "setup_states"`);
  }
}
