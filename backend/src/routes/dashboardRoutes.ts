import { Router } from 'express';
import { getEmployeeStats, getAdminStats, getInventoryStats, getSalesStats, getCustomerStats, getBusinessTrends } from '../controllers/dashboardController';
import { authenticate, requireAdmin } from '../middlewares/auth';

const router = Router();

router.use(authenticate);

router.get('/employee-stats', getEmployeeStats);
router.get('/admin-stats', requireAdmin, getAdminStats);
router.get('/inventory-stats', requireAdmin, getInventoryStats);
router.get('/sales-stats', requireAdmin, getSalesStats);
router.get('/customer-stats', requireAdmin, getCustomerStats);
router.get('/trends', requireAdmin, getBusinessTrends);

export default router;
