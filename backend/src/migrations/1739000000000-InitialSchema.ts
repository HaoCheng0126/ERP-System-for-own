import type { MigrationInterface, QueryRunner } from '../lib/typeorm';

export class InitialSchema1739000000000 implements MigrationInterface {
  name = 'InitialSchema1739000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(`
      CREATE TYPE "users_role_enum" AS ENUM ('piece_rate', 'admin')
    `);
    await queryRunner.query(`
      CREATE TYPE "inventory_records_status_enum" AS ENUM ('pending', 'approved', 'rejected')
    `);
    await queryRunner.query(`
      CREATE TYPE "delivery_orders_status_enum" AS ENUM ('pending', 'settled', 'partial')
    `);
    await queryRunner.query(`
      CREATE TYPE "statements_period_enum" AS ENUM ('weekly', 'biweekly', 'monthly')
    `);

    await queryRunner.query(`
      CREATE TABLE "companies" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying NOT NULL,
        "address" character varying,
        "contactPerson" character varying,
        "phone" character varying,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_companies" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "username" character varying NOT NULL,
        "password" character varying NOT NULL,
        "name" character varying NOT NULL,
        "role" "users_role_enum" NOT NULL DEFAULT 'piece_rate',
        "phone" character varying,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_users" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_users_username" UNIQUE ("username")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "customers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "code" character varying NOT NULL,
        "name" character varying NOT NULL,
        "address" character varying,
        "contactPerson" character varying,
        "phone" character varying,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_customers" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_customers_code" UNIQUE ("code")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "products" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying NOT NULL,
        "specification" character varying NOT NULL,
        "unit" character varying NOT NULL,
        "costPrice" numeric(12,4) NOT NULL,
        "basePrice" numeric(12,4),
        "stock" numeric(10,2) NOT NULL DEFAULT 0,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_products" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "product_prices" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "productId" uuid NOT NULL,
        "customerId" uuid NOT NULL,
        "price" numeric(12,4) NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_product_prices" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_product_prices_product_customer" UNIQUE ("productId", "customerId"),
        CONSTRAINT "FK_product_prices_product" FOREIGN KEY ("productId") REFERENCES "products"("id"),
        CONSTRAINT "FK_product_prices_customer" FOREIGN KEY ("customerId") REFERENCES "customers"("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "inventory_records" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "productId" uuid NOT NULL,
        "submittedBy" uuid NOT NULL,
        "reviewedBy" uuid,
        "recordNumber" character varying NOT NULL,
        "quantity" numeric(12,4) NOT NULL,
        "unitPrice" numeric(12,4) NOT NULL,
        "totalAmount" numeric(12,4) NOT NULL,
        "status" "inventory_records_status_enum" NOT NULL DEFAULT 'pending',
        "remark" text,
        "reviewedAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_inventory_records" PRIMARY KEY ("id"),
        CONSTRAINT "FK_inventory_records_product" FOREIGN KEY ("productId") REFERENCES "products"("id"),
        CONSTRAINT "FK_inventory_records_submitter" FOREIGN KEY ("submittedBy") REFERENCES "users"("id"),
        CONSTRAINT "FK_inventory_records_reviewer" FOREIGN KEY ("reviewedBy") REFERENCES "users"("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "delivery_orders" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "orderNumber" character varying NOT NULL,
        "customerId" uuid NOT NULL,
        "deliveryDate" date NOT NULL,
        "totalAmount" numeric(12,2) NOT NULL DEFAULT 0,
        "paidAmount" numeric(12,2) NOT NULL DEFAULT 0,
        "status" "delivery_orders_status_enum" NOT NULL DEFAULT 'pending',
        "remark" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_delivery_orders" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_delivery_orders_orderNumber" UNIQUE ("orderNumber"),
        CONSTRAINT "FK_delivery_orders_customer" FOREIGN KEY ("customerId") REFERENCES "customers"("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "delivery_order_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "deliveryOrderId" uuid NOT NULL,
        "productId" uuid NOT NULL,
        "quantity" numeric(12,4) NOT NULL,
        "unitPrice" numeric(12,4) NOT NULL,
        "amount" numeric(12,4) NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_delivery_order_items" PRIMARY KEY ("id"),
        CONSTRAINT "FK_delivery_order_items_order" FOREIGN KEY ("deliveryOrderId") REFERENCES "delivery_orders"("id"),
        CONSTRAINT "FK_delivery_order_items_product" FOREIGN KEY ("productId") REFERENCES "products"("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "statements" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "customerId" uuid NOT NULL,
        "period" "statements_period_enum" NOT NULL,
        "startDate" date NOT NULL,
        "endDate" date NOT NULL,
        "totalAmount" numeric(12,2) NOT NULL,
        "remark" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_statements" PRIMARY KEY ("id"),
        CONSTRAINT "FK_statements_customer" FOREIGN KEY ("customerId") REFERENCES "customers"("id")
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "statements"`);
    await queryRunner.query(`DROP TABLE "delivery_order_items"`);
    await queryRunner.query(`DROP TABLE "delivery_orders"`);
    await queryRunner.query(`DROP TABLE "inventory_records"`);
    await queryRunner.query(`DROP TABLE "product_prices"`);
    await queryRunner.query(`DROP TABLE "products"`);
    await queryRunner.query(`DROP TABLE "customers"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TABLE "companies"`);
    await queryRunner.query(`DROP TYPE "statements_period_enum"`);
    await queryRunner.query(`DROP TYPE "delivery_orders_status_enum"`);
    await queryRunner.query(`DROP TYPE "inventory_records_status_enum"`);
    await queryRunner.query(`DROP TYPE "users_role_enum"`);
  }
}
