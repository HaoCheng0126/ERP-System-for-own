import type { MigrationInterface, QueryRunner } from '../lib/typeorm';

export class AddSalaryDeductions1796500000000 implements MigrationInterface {
  name = 'AddSalaryDeductions1796500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "salary_deductions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "employeeId" uuid NOT NULL,
        "type" character varying(20) NOT NULL DEFAULT 'other',
        "amount" decimal(12,4) NOT NULL,
        "reason" text,
        "returnOrderId" uuid,
        "deductionDate" date NOT NULL,
        "createdBy" uuid NOT NULL,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_salary_deductions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_salary_deductions_employee" FOREIGN KEY ("employeeId")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_salary_deductions_createdBy" FOREIGN KEY ("createdBy")
          REFERENCES "users"("id"),
        CONSTRAINT "FK_salary_deductions_returnOrder" FOREIGN KEY ("returnOrderId")
          REFERENCES "return_orders"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_salary_deductions_employeeId" ON "salary_deductions" ("employeeId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_salary_deductions_deductionDate" ON "salary_deductions" ("deductionDate")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "salary_deductions"`);
  }
}
