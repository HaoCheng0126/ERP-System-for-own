import { Router } from 'express';
import { getEmployeeStats, getAdminStats, getInventoryStats, getSalesStats, getCustomerStats } from '../controllers/dashboardController';
import { authenticate, requireAdmin } from '../middlewares/auth';

const router = Router();

router.use(authenticate);

router.get('/employee-stats', getEmployeeStats);
router.get('/admin-stats', requireAdmin, getAdminStats);
router.get('/inventory-stats', requireAdmin, getInventoryStats);
router.get('/sales-stats', requireAdmin, getSalesStats);
router.get('/customer-stats', requireAdmin, getCustomerStats);

export default router;
