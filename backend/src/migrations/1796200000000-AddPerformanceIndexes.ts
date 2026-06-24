import type { MigrationInterface, QueryRunner } from '../lib/typeorm';

// 为列表筛选/排序与对账聚合常用的外键、日期、状态列补建索引。
// 当前数据量很小、无明显收益，但随着送货/进货/入库记录累积可避免全表扫描。
// 开发环境用 synchronize 由实体 @Index 自动建；本迁移用于生产环境（synchronize 关闭）。
export class AddPerformanceIndexes1796200000000 implements MigrationInterface {
  name = 'AddPerformanceIndexes1796200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_delivery_orders_customer_date" ON "delivery_orders" ("customerId", "deliveryDate")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_delivery_orders_status" ON "delivery_orders" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_purchase_orders_supplier_date" ON "purchase_orders" ("supplierId", "purchaseDate")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_purchase_orders_product" ON "purchase_orders" ("productId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_inventory_records_submitter_created" ON "inventory_records" ("submittedBy", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_inventory_records_status" ON "inventory_records" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_inventory_records_product" ON "inventory_records" ("productId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_payment_records_customer_date" ON "payment_records" ("customerId", "paymentDate")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_return_orders_customer" ON "return_orders" ("customerId")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_return_orders_customer"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_payment_records_customer_date"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_inventory_records_product"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_inventory_records_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_inventory_records_submitter_created"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_purchase_orders_product"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_purchase_orders_supplier_date"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_delivery_orders_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_delivery_orders_customer_date"`);
  }
}
