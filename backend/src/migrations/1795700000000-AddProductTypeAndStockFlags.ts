import type { MigrationInterface, QueryRunner } from '../lib/typeorm';

export class AddProductTypeAndStockFlags1795700000000 implements MigrationInterface {
  name = 'AddProductTypeAndStockFlags1795700000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "products_type_enum" AS ENUM ('finished', 'raw_material')`);
    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN "type" "products_type_enum" NOT NULL DEFAULT 'finished'
    `);
    await queryRunner.query(`
      ALTER TABLE "delivery_orders"
      ADD COLUMN "stockDeducted" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      ALTER TABLE "purchase_orders"
      ADD COLUMN "productId" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "purchase_orders"
      ADD COLUMN "stockApplied" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      ALTER TABLE "purchase_orders"
      ADD CONSTRAINT "FK_purchase_orders_productId_products_id"
      FOREIGN KEY ("productId") REFERENCES "products"("id")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "purchase_orders"
      DROP CONSTRAINT "FK_purchase_orders_productId_products_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "purchase_orders"
      DROP COLUMN "stockApplied"
    `);
    await queryRunner.query(`
      ALTER TABLE "purchase_orders"
      DROP COLUMN "productId"
    `);
    await queryRunner.query(`
      ALTER TABLE "delivery_orders"
      DROP COLUMN "stockDeducted"
    `);
    await queryRunner.query(`
      ALTER TABLE "products"
      DROP COLUMN "type"
    `);
    await queryRunner.query(`DROP TYPE "products_type_enum"`);
  }
}
