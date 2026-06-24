import type { MigrationInterface, QueryRunner } from '../lib/typeorm';

export class AddStockAdjustments1795800000000 implements MigrationInterface {
  name = 'AddStockAdjustments1795800000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "stock_adjustments_reason_enum" AS ENUM ('manual_correction')`);
    await queryRunner.query(`
      CREATE TABLE "stock_adjustments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "productId" uuid NOT NULL,
        "adjustedBy" uuid,
        "previousStock" numeric(12,4) NOT NULL,
        "deltaQuantity" numeric(12,4) NOT NULL,
        "nextStock" numeric(12,4) NOT NULL,
        "reason" "stock_adjustments_reason_enum" NOT NULL DEFAULT 'manual_correction',
        "remark" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_stock_adjustments_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "stock_adjustments"
      ADD CONSTRAINT "FK_stock_adjustments_productId_products_id"
      FOREIGN KEY ("productId") REFERENCES "products"("id")
    `);
    await queryRunner.query(`
      ALTER TABLE "stock_adjustments"
      ADD CONSTRAINT "FK_stock_adjustments_adjustedBy_users_id"
      FOREIGN KEY ("adjustedBy") REFERENCES "users"("id")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "stock_adjustments"
      DROP CONSTRAINT "FK_stock_adjustments_adjustedBy_users_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "stock_adjustments"
      DROP CONSTRAINT "FK_stock_adjustments_productId_products_id"
    `);
    await queryRunner.query(`DROP TABLE "stock_adjustments"`);
    await queryRunner.query(`DROP TYPE "stock_adjustments_reason_enum"`);
  }
}
