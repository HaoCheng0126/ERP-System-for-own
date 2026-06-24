import type { MigrationInterface, QueryRunner } from '../lib/typeorm';

export class AddReturnOrders1795900000000 implements MigrationInterface {
  name = 'AddReturnOrders1795900000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // 1) 给入库单提交方式枚举增加「退货扣款」值（Postgres 12+ 允许在事务内 ADD VALUE，只要不在同事务内使用）
    await queryRunner.query(
      `ALTER TYPE "inventory_records_submissionmode_enum" ADD VALUE IF NOT EXISTS 'return_deduction'`,
    );

    // 2) 退货单
    await queryRunner.query(`
      CREATE TABLE "return_orders" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "returnNumber" character varying NOT NULL,
        "customerId" uuid NOT NULL,
        "deliveryOrderId" uuid,
        "returnDate" date NOT NULL,
        "totalAmount" numeric(12,2) NOT NULL DEFAULT '0',
        "remark" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_return_orders_returnNumber" UNIQUE ("returnNumber"),
        CONSTRAINT "PK_return_orders_id" PRIMARY KEY ("id")
      )
    `);

    // 3) 退货明细
    await queryRunner.query(`
      CREATE TABLE "return_order_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "returnOrderId" uuid NOT NULL,
        "productId" uuid NOT NULL,
        "quantity" numeric(12,4) NOT NULL,
        "unitPrice" numeric(12,4) NOT NULL,
        "amount" numeric(12,4) NOT NULL,
        "restock" boolean NOT NULL DEFAULT true,
        "deductEmployeeId" uuid,
        "deductQuantity" numeric(12,4) NOT NULL DEFAULT '0',
        "deductInventoryRecordId" uuid,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_return_order_items_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "return_orders"
      ADD CONSTRAINT "FK_return_orders_customerId_customers_id"
      FOREIGN KEY ("customerId") REFERENCES "customers"("id")
    `);
    await queryRunner.query(`
      ALTER TABLE "return_orders"
      ADD CONSTRAINT "FK_return_orders_deliveryOrderId_delivery_orders_id"
      FOREIGN KEY ("deliveryOrderId") REFERENCES "delivery_orders"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "return_order_items"
      ADD CONSTRAINT "FK_return_order_items_returnOrderId_return_orders_id"
      FOREIGN KEY ("returnOrderId") REFERENCES "return_orders"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "return_order_items"
      ADD CONSTRAINT "FK_return_order_items_productId_products_id"
      FOREIGN KEY ("productId") REFERENCES "products"("id")
    `);
    await queryRunner.query(`
      ALTER TABLE "return_order_items"
      ADD CONSTRAINT "FK_return_order_items_deductInventoryRecordId_inventory_records_id"
      FOREIGN KEY ("deductInventoryRecordId") REFERENCES "inventory_records"("id") ON DELETE SET NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "return_order_items"`);
    await queryRunner.query(`DROP TABLE "return_orders"`);
    // 注意：Postgres 不支持从枚举中删除值，故 down 不回退 'return_deduction'。
  }
}
