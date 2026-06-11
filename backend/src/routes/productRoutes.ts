import { Router } from 'express';
import {
  getProducts,
  getProductById,
  getProductBySpecification,
  createProduct,
  updateProduct,
  deleteProduct,
  getProductPrices,
  getProductPriceForCustomer,
  setProductPriceForCustomer,
  deleteProductPrice,
} from '../controllers/productController';
import { authenticate, requireAdmin } from '../middlewares/auth';

const router = Router();

router.get('/', authenticate, getProducts);
router.get('/spec/:specification', authenticate, requireAdmin, getProductBySpecification);
router.get('/:id', authenticate, requireAdmin, getProductById);
router.post('/', authenticate, requireAdmin, createProduct);
router.put('/:id', authenticate, requireAdmin, updateProduct);
router.delete('/:id', authenticate, requireAdmin, deleteProduct);

router.get('/:productId/prices', authenticate, requireAdmin, getProductPrices);
router.get('/:productId/prices/:customerId', authenticate, requireAdmin, getProductPriceForCustomer);
router.post('/:productId/prices/:customerId', authenticate, requireAdmin, setProductPriceForCustomer);
router.delete('/:productId/prices/:priceId', authenticate, requireAdmin, deleteProductPrice);

export default router;
