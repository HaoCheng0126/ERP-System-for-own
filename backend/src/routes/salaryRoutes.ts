import { Router } from 'express';
import { getSalaryReport } from '../controllers/salaryController';
import { authenticate } from '../middlewares/auth';

const router = Router();

router.get('/report', authenticate, getSalaryReport);

export default router;
