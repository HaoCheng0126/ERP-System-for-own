import type { MigrationInterface, QueryRunner } from '../lib/typeorm';

export class AddSystemSettings1796100000000 implements MigrationInterface {
  name = 'AddSystemSettings1796100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "system_settings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "key" character varying NOT NULL,
        "value" text,
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_system_settings_key" UNIQUE ("key"),
        CONSTRAINT "PK_system_settings_id" PRIMARY KEY ("id")
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "system_settings"`);
  }
}
