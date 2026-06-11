import type { MigrationInterface, QueryRunner } from '../lib/typeorm';

export class RestructurePurchasesForSuppliers1791200000000 implements MigrationInterface {
  name = 'RestructurePurchasesForSuppliers1791200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "purchase_orders" ADD "supplierId" uuid`);
    await queryRunner.query(`ALTER TABLE "purchase_orders" ADD "unitPrice" numeric(12,4) NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "purchase_orders" ALTER COLUMN "quantity" TYPE numeric(12,4) USING "quantity"::numeric(12,4)`);
    await queryRunner.query(`ALTER TABLE "purchase_orders" ALTER COLUMN "amount" TYPE numeric(12,4) USING "amount"::numeric(12,4)`);
    await queryRunner.query(`ALTER TABLE "purchase_orders" ALTER COLUMN "paidAmount" TYPE numeric(12,4) USING COALESCE("paidAmount", 0)::numeric(12,4)`);

    await queryRunner.query(`
      WITH "unique_suppliers" AS (
        SELECT "name", MIN("id") AS "supplierId"
        FROM "customers"
        WHERE "type" = 'Supplier'
        GROUP BY "name"
        HAVING COUNT(*) = 1
      )
      UPDATE "purchase_orders" AS "purchase"
      SET "supplierId" = "unique_suppliers"."supplierId"
      FROM "unique_suppliers"
      WHERE "purchase"."supplierId" IS NULL
        AND "purchase"."supplier" = "unique_suppliers"."name"
    `);

    await queryRunner.query(`
      UPDATE "purchase_orders"
      SET "unitPrice" = CASE
        WHEN ABS(COALESCE("quantity", 0)) > 0.0000001 THEN ROUND(COALESCE("amount", 0) / "quantity", 4)
        ELSE 0
      END
    `);

    await queryRunner.query(`
      INSERT INTO "payment_records" ("customerId", "amount", "paymentDate", "method", "remarks", "createdAt", "updatedAt")
      SELECT
        "purchase"."supplierId",
        "purchase"."paidAmount",
        "purchase"."purchaseDate",
        'Public_Cash',
        CONCAT('历史迁移：原进货记录已付金额', CASE WHEN COALESCE("purchase"."remark", '') <> '' THEN CONCAT('；', "purchase"."remark") ELSE '' END),
        NOW(),
        NOW()
      FROM "purchase_orders" AS "purchase"
      WHERE "purchase"."supplierId" IS NOT NULL
        AND COALESCE("purchase"."paidAmount", 0) > 0
    `);

    await queryRunner.query(`
      UPDATE "purchase_orders"
      SET "paidAmount" = 0,
          "status" = 'pending'
      WHERE "supplierId" IS NOT NULL
        AND COALESCE("paidAmount", 0) > 0
    `);

    await queryRunner.query(`
      ALTER TABLE "purchase_orders"
      ADD CONSTRAINT "FK_purchase_orders_supplierId_customers_id"
      FOREIGN KEY ("supplierId") REFERENCES "customers"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "purchase_orders"
      DROP CONSTRAINT "FK_purchase_orders_supplierId_customers_id"
    `);
    await queryRunner.query(`ALTER TABLE "purchase_orders" DROP COLUMN "unitPrice"`);
    await queryRunner.query(`ALTER TABLE "purchase_orders" DROP COLUMN "supplierId"`);
    await queryRunner.query(`ALTER TABLE "purchase_orders" ALTER COLUMN "paidAmount" TYPE numeric(10,2) USING COALESCE("paidAmount", 0)::numeric(10,2)`);
    await queryRunner.query(`ALTER TABLE "purchase_orders" ALTER COLUMN "amount" TYPE numeric(10,2) USING COALESCE("amount", 0)::numeric(10,2)`);
    await queryRunner.query(`ALTER TABLE "purchase_orders" ALTER COLUMN "quantity" TYPE integer USING ROUND(COALESCE("quantity", 0))::integer`);
  }
}
