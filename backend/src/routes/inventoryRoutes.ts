import { Router } from 'express';
import {
  getInventoryRecords,
  getInventoryRecordById,
  createInventoryRecord,
  reviewInventoryRecord,
  reviewInventoryRecordsBatch,
  updateInventoryRecord,
  deleteInventoryRecord,
} from '../controllers/inventoryController';
import { authenticate, requireAdmin } from '../middlewares/auth';

const router = Router();

router.get('/', authenticate, getInventoryRecords);
router.get('/:id', authenticate, getInventoryRecordById);
router.post('/', authenticate, createInventoryRecord);
router.put('/batch/review', authenticate, requireAdmin, reviewInventoryRecordsBatch);
router.put('/:id', authenticate, updateInventoryRecord);
// 删除：员工可删自己「待审/驳回」的单，管理员可删任意（已通过会回退库存）——具体校验在 service 内。
router.delete('/:id', authenticate, deleteInventoryRecord);
router.put('/:id/review', authenticate, requireAdmin, reviewInventoryRecord);

export default router;
