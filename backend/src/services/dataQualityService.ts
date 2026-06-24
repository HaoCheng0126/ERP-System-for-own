import { AppDataSource } from '../config/database';
import { roundLineAmount } from '../utils/decimal';

export type DataQualityIssue = {
  code: string;
  severity: 'error' | 'warning';
  entity: string;
  id: string;
  message: string;
  currentValue: string | number | null;
  expectedValue: string | number | null;
};

const toIssue = (row: Record<string, unknown>): DataQualityIssue => ({
  code: String(row.code),
  severity: row.severity === 'warning' ? 'warning' : 'error',
  entity: String(row.entity),
  id: String(row.id),
  message: String(row.message),
  currentValue: row.currentValue as string | number | null,
  expectedValue: row.expectedValue as string | number | null,
});

export class DataQualityService {
  async audit(): Promise<DataQualityIssue[]> {
    const rows = await AppDataSource.query(`
      SELECT 'negative_product_stock' AS code, 'error' AS severity, 'product' AS entity, id::text AS id,
        '产品库存不能为负数' AS message, stock::text AS "currentValue", '>= 0' AS "expectedValue"
      FROM products WHERE stock < 0

      UNION ALL
      SELECT 'invalid_inventory_amount', 'error', 'inventory_record', id::text,
        '入库单数量、单价、金额必须为有效非负数', concat('quantity=', quantity, ', unitPrice=', "unitPrice", ', totalAmount=', "totalAmount"), 'quantity > 0 and amount >= 0'
      FROM inventory_records WHERE quantity <= 0 OR "unitPrice" < 0 OR "totalAmount" < 0

      UNION ALL
      SELECT 'invalid_delivery_item_amount', 'error', 'delivery_order_item', id::text,
        '送货明细数量、单价、金额必须为有效非负数', concat('quantity=', quantity, ', unitPrice=', "unitPrice", ', amount=', amount), 'quantity > 0 and amount >= 0'
      FROM delivery_order_items WHERE quantity <= 0 OR "unitPrice" < 0 OR amount < 0

      UNION ALL
      SELECT 'invalid_purchase_amount', 'error', 'purchase_order', id::text,
        '进货单数量、单价、金额必须为有效非负数', concat('quantity=', quantity, ', unitPrice=', "unitPrice", ', amount=', amount), 'quantity > 0 and amount >= 0'
      FROM purchase_orders WHERE quantity <= 0 OR "unitPrice" < 0 OR amount < 0

      UNION ALL
      SELECT 'invalid_payment_amount', 'error', 'payment_record', id::text,
        '收付款流水金额必须大于 0', amount::text, '> 0'
      FROM payment_records WHERE amount <= 0

      UNION ALL
      SELECT 'delivery_non_client_customer', 'error', 'delivery_order', d.id::text,
        '送货单只能关联客户', c.type::text, 'Client'
      FROM delivery_orders d JOIN customers c ON c.id = d."customerId" WHERE c.type <> 'Client'

      UNION ALL
      SELECT 'purchase_non_supplier_customer', 'error', 'purchase_order', p.id::text,
        '进货单只能关联供应商', c.type::text, 'Supplier'
      FROM purchase_orders p JOIN customers c ON c.id = p."supplierId" WHERE c.type <> 'Supplier'

      UNION ALL
      SELECT 'inventory_non_finished_product', 'error', 'inventory_record', r.id::text,
        '入库单只能关联成品', p.type::text, 'finished'
      FROM inventory_records r JOIN products p ON p.id = r."productId" WHERE p.type <> 'finished'

      UNION ALL
      SELECT 'delivery_non_finished_product', 'error', 'delivery_order_item', i.id::text,
        '送货明细只能关联成品', p.type::text, 'finished'
      FROM delivery_order_items i JOIN products p ON p.id = i."productId" WHERE p.type <> 'finished'

      UNION ALL
      SELECT 'purchase_non_raw_product', 'error', 'purchase_order', po.id::text,
        '进货单只能关联原材料', p.type::text, 'raw_material'
      FROM purchase_orders po JOIN products p ON p.id = po."productId" WHERE p.type <> 'raw_material'

      UNION ALL
      SELECT 'settled_delivery_paid_mismatch', 'warning', 'delivery_order', id::text,
        '旧结算状态字段与已付金额不一致', concat('status=', status, ', paidAmount=', "paidAmount"), "totalAmount"::text
      FROM delivery_orders WHERE status='settled' AND abs(coalesce("paidAmount",0)-coalesce("totalAmount",0)) > 0.0001

      UNION ALL
      SELECT 'partial_delivery_invalid_paid', 'warning', 'delivery_order', id::text,
        '旧部分结算字段金额不在有效区间', concat('paidAmount=', "paidAmount", ', totalAmount=', "totalAmount"), '0 < paidAmount < totalAmount'
      FROM delivery_orders WHERE status='partial' AND (coalesce("paidAmount",0) <= 0 OR coalesce("paidAmount",0) >= coalesce("totalAmount",0))

      UNION ALL
      SELECT 'pending_delivery_has_paid', 'warning', 'delivery_order', id::text,
        '待结算送货单仍保留旧已付金额', "paidAmount"::text, '0'
      FROM delivery_orders WHERE status='pending' AND coalesce("paidAmount",0) <> 0

      UNION ALL
      SELECT 'purchase_legacy_paid_remaining', 'warning', 'purchase_order', id::text,
        '进货单仍保留旧 paidAmount，应迁移到 payment_records', "paidAmount"::text, '0'
      FROM purchase_orders WHERE coalesce("paidAmount",0) <> 0

      UNION ALL
      SELECT 'delivery_total_item_mismatch', 'error', 'delivery_order', d.id::text,
        '送货单总额与明细合计不一致', d."totalAmount"::text, round(coalesce(x.item_total,0), 2)::text
      FROM delivery_orders d
      JOIN (
        SELECT "deliveryOrderId", sum(amount) item_total
        FROM delivery_order_items
        GROUP BY "deliveryOrderId"
      ) x ON x."deliveryOrderId" = d.id
      WHERE abs(coalesce(d."totalAmount",0)-coalesce(x.item_total,0)) > 0.0001

      UNION ALL
      SELECT 'inventory_total_mismatch', 'error', 'inventory_record', id::text,
        '入库单金额与数量乘单价不一致', "totalAmount"::text, round(coalesce(quantity,0)*coalesce("unitPrice",0), 4)::text
      FROM inventory_records WHERE abs(coalesce("totalAmount",0)-coalesce(quantity,0)*coalesce("unitPrice",0)) > 0.0001

      UNION ALL
      SELECT 'purchase_total_mismatch', 'error', 'purchase_order', id::text,
        '进货单金额与数量乘单价不一致', amount::text, round(coalesce(quantity,0)*coalesce("unitPrice",0), 4)::text
      FROM purchase_orders WHERE abs(coalesce(amount,0)-coalesce(quantity,0)*coalesce("unitPrice",0)) > 0.0001
    `);

    return rows.map(toIssue);
  }

  async fixDeterministicAmountMismatches() {
    const issues = await this.audit();
    const fixableCodes = new Set([
      'delivery_total_item_mismatch',
      'inventory_total_mismatch',
      'purchase_total_mismatch',
    ]);
    const fixableIssues = issues.filter((issue) => fixableCodes.has(issue.code));

    await AppDataSource.transaction(async (manager) => {
      for (const issue of fixableIssues) {
        if (issue.code === 'delivery_total_item_mismatch') {
          await manager.query(`
            UPDATE delivery_orders
            SET "totalAmount" = (
              SELECT round(coalesce(sum(amount), 0), 2)
              FROM delivery_order_items
              WHERE "deliveryOrderId" = $1
            )
            WHERE id = $1
          `, [issue.id]);
        }

        if (issue.code === 'inventory_total_mismatch') {
          await manager.query(`
            UPDATE inventory_records
            SET "totalAmount" = round(coalesce(quantity, 0) * coalesce("unitPrice", 0), 4)
            WHERE id = $1
          `, [issue.id]);
        }

        if (issue.code === 'purchase_total_mismatch') {
          const [purchase] = await manager.query(
            'SELECT quantity, "unitPrice" FROM purchase_orders WHERE id = $1',
            [issue.id],
          );
          if (purchase) {
            await manager.query(
              'UPDATE purchase_orders SET amount = $2 WHERE id = $1',
              [issue.id, roundLineAmount(purchase.quantity, purchase.unitPrice, 4)],
            );
          }
        }
      }
    });

    return {
      fixedCount: fixableIssues.length,
      fixedIssues: fixableIssues,
    };
  }
}

export const dataQualityService = new DataQualityService();
