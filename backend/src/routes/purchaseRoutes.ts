import { Router } from 'express';
import { purchaseController } from '../controllers/purchaseController';
import { authenticate, requireAdmin } from '../middlewares/auth';

const router = Router();

router.use(authenticate);
router.use(requireAdmin);

router.get('/', purchaseController.getAll.bind(purchaseController));
router.post('/', purchaseController.create.bind(purchaseController));
router.get('/:id', purchaseController.getOne.bind(purchaseController));
router.put('/:id', purchaseController.update.bind(purchaseController));
router.delete('/:id', purchaseController.delete.bind(purchaseController));

export default router;
