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
router.delete('/:id', authenticate, requireAdmin, deleteInventoryRecord);
router.put('/:id/review', authenticate, requireAdmin, reviewInventoryRecord);

export default router;
