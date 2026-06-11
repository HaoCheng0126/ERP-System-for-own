import type { MigrationInterface, QueryRunner } from '../lib/typeorm';

export class AddUnitToPurchaseOrder1771764103611 implements MigrationInterface {
    name = 'AddUnitToPurchaseOrder1771764103611'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "purchase_orders" ADD "unit" character varying DEFAULT '个' NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "purchase_orders" DROP COLUMN "unit"`);
    }

}
