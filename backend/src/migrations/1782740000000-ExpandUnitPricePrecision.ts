import type { MigrationInterface, QueryRunner } from '../lib/typeorm';

export class ExpandUnitPricePrecision1782740000000 implements MigrationInterface {
  name = 'ExpandUnitPricePrecision1782740000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "costPrice" TYPE numeric(12,4)`);
    await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "basePrice" TYPE numeric(12,4)`);
    await queryRunner.query(`ALTER TABLE "product_prices" ALTER COLUMN "price" TYPE numeric(12,4)`);
    await queryRunner.query(`ALTER TABLE "inventory_records" ALTER COLUMN "quantity" TYPE numeric(12,4)`);
    await queryRunner.query(`ALTER TABLE "inventory_records" ALTER COLUMN "unitPrice" TYPE numeric(12,4)`);
    await queryRunner.query(`ALTER TABLE "inventory_records" ALTER COLUMN "totalAmount" TYPE numeric(12,4)`);
    await queryRunner.query(`ALTER TABLE "delivery_order_items" ALTER COLUMN "quantity" TYPE numeric(12,4)`);
    await queryRunner.query(`ALTER TABLE "delivery_order_items" ALTER COLUMN "unitPrice" TYPE numeric(12,4)`);
    await queryRunner.query(`ALTER TABLE "delivery_order_items" ALTER COLUMN "amount" TYPE numeric(12,4)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "delivery_order_items" ALTER COLUMN "amount" TYPE numeric(12,2)`);
    await queryRunner.query(`ALTER TABLE "delivery_order_items" ALTER COLUMN "unitPrice" TYPE numeric(10,2)`);
    await queryRunner.query(`ALTER TABLE "delivery_order_items" ALTER COLUMN "quantity" TYPE numeric(10,2)`);
    await queryRunner.query(`ALTER TABLE "inventory_records" ALTER COLUMN "totalAmount" TYPE numeric(10,2)`);
    await queryRunner.query(`ALTER TABLE "inventory_records" ALTER COLUMN "unitPrice" TYPE numeric(10,2)`);
    await queryRunner.query(`ALTER TABLE "inventory_records" ALTER COLUMN "quantity" TYPE numeric(10,2)`);
    await queryRunner.query(`ALTER TABLE "product_prices" ALTER COLUMN "price" TYPE numeric(10,2)`);
    await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "basePrice" TYPE numeric(10,2)`);
    await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "costPrice" TYPE numeric(10,2)`);
  }
}
