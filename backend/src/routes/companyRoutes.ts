import { Router } from 'express';
import { getCompany, updateCompany } from '../controllers/companyController';
import { authenticate, requireAdmin } from '../middlewares/auth';

const router = Router();

router.get('/', authenticate, getCompany);
router.put('/', authenticate, requireAdmin, updateCompany);

export default router;
