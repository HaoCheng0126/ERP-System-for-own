import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, DollarSign, Edit, Package, Plus, Save, Trash2, X } from 'lucide-react';
import ActionableEmptyState from '../components/ActionableEmptyState';
import QueryStateBanner from '../components/QueryStateBanner';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import api from '../utils/api';
import { formatEditableDecimal, formatUnitPrice } from '../utils/format';
import { Product, Customer, ProductPrice } from '../types';

type ProductFormState = Omit<
  Product,
  'id' | 'isActive' | 'createdAt' | 'updatedAt' | 'productPrices' | 'costPrice' | 'basePrice' | 'stock'
> & {
  costPrice: string | number;
  basePrice: string | number;
  stock: string | number;
};

type EditableProductState = ProductFormState & { id: string };

const createEmptyProductForm = (): ProductFormState => ({
  name: '',
  specification: '',
  unit: '',
  costPrice: '',
  basePrice: '',
  stock: 0,
});

const toEditableProductForm = (product: Product): EditableProductState => ({
  ...product,
  costPrice: formatEditableDecimal(product.costPrice),
  basePrice: formatEditableDecimal(product.basePrice ?? 0),
  stock: product.stock ?? 0,
});

const Products: React.FC = () => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<EditableProductState | null>(null);
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);
  const [newProduct, setNewProduct] = useState<ProductFormState>(createEmptyProductForm());

  const [customerPrice, setCustomerPrice] = useState<{ customerId: string; price: string | number }>({
    customerId: '',
    price: '',
  });

  const queryClient = useQueryClient();

  // 获取产品列表
  const { data: products, isLoading, error, refetch } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const response = await api.get('/products');
      return response.data;
    },
  });

  // 获取客户列表
  const { data: customers } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const response = await api.get('/customers');
      return response.data;
    },
  });

  // 获取产品价格列表
  const { data: productPrices } = useQuery({
    queryKey: ['productPrices', expandedProductId],
    queryFn: async () => {
      if (!expandedProductId) return [];
      try {
        const response = await api.get(`/products/${expandedProductId}/prices`);
        return response.data || [];
      } catch (err) {
        console.error('Failed to fetch prices:', err);
        return [];
      }
    },
    enabled: !!expandedProductId,
  });

  // 添加产品
  const addProductMutation = useMutation({
    mutationFn: async (product: typeof newProduct) => {
      const payload = {
        ...product,
        costPrice: Number(product.costPrice),
        basePrice: Number(product.basePrice),
        stock: Number(product.stock)
      };
      const response = await api.post('/products', payload);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setShowAddModal(false);
      setNewProduct(createEmptyProductForm());
    },
  });

  // 更新产品
  const updateProductMutation = useMutation({
    mutationFn: async (product: EditableProductState) => {
      const response = await api.put(`/products/${product.id}`, {
        ...product,
        costPrice: Number(product.costPrice),
        basePrice: Number(product.basePrice || 0),
        stock: Number(product.stock || 0),
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setEditingProduct(null);
    },
  });

  // 删除产品
  const deleteProductMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await api.delete(`/products/${id}`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });

  // 设置客户价格
  const setPriceMutation = useMutation({
    mutationFn: async (data: typeof customerPrice) => {
      if (!expandedProductId) return;
      const response = await api.post(`/products/${expandedProductId}/prices/${data.customerId}`, {
        price: Number(data.price),
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['productPrices', expandedProductId] });
      setCustomerPrice({ customerId: '', price: '' });
    },
  });

  // 删除客户价格
  const deletePriceMutation = useMutation({
    mutationFn: async (priceId: string) => {
      if (!expandedProductId) return;
      await api.delete(`/products/${expandedProductId}/prices/${priceId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['productPrices', expandedProductId] });
    },
  });

  const handleAddProduct = () => {
    addProductMutation.mutate(newProduct);
  };

  const handleUpdateProduct = () => {
    if (editingProduct) {
      updateProductMutation.mutate(editingProduct);
    }
  };

  const handleDeleteProduct = (id: string) => {
    if (window.confirm('确定要删除这个产品吗？')) {
      deleteProductMutation.mutate(id);
    }
  };

  const handleToggleExpand = (productId: string) => {
    setExpandedProductId(expandedProductId === productId ? null : productId);
  };

  const handleSetPrice = () => {
    if (customerPrice.customerId && (customerPrice.price !== '' && Number(customerPrice.price) > 0)) {
      setPriceMutation.mutate(customerPrice);
    }
  };

  const handleDeletePrice = (priceId: string) => {
    if (window.confirm('确定要删除这个客户定价吗？')) {
      deletePriceMutation.mutate(priceId);
    }
  };

  return (
    <Layout>
      <PageHeader 
        title="产品管理" 
        subtitle="管理您的产品信息和规格" 
        action={{ label: '添加产品', onClick: () => setShowAddModal(true) }}
      />
      
      <div className="p-4 md:p-8">
        <QueryStateBanner
          isLoading={isLoading}
          isError={Boolean(error)}
          loadingText="正在同步产品资料..."
          errorText="产品资料暂时无法同步，请确认后端服务已启动。"
          onRetry={() => refetch()}
        />
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          {!isLoading && (products || []).length === 0 ? (
            <div className="p-6">
              <ActionableEmptyState
                icon={Package}
                title="先添加第一个产品"
                description="产品名称、规格、单位和入库单价是入库单、送货单、库存和工资计算的基础。"
                actionLabel="添加产品"
                onAction={() => setShowAddModal(true)}
              />
            </div>
          ) : (products || []).length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="w-10 px-6 py-3"></th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">产品名称</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">规格</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">单位</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">当前库存</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">入库单价 (元/单位)</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {(products || []).map((product: Product) => (
                  <React.Fragment key={product.id}>
                    <tr className={expandedProductId === product.id ? 'bg-blue-50' : ''}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          onClick={() => handleToggleExpand(product.id)}
                          className="text-gray-400 hover:text-gray-600 focus:outline-none"
                        >
                          {expandedProductId === product.id ? (
                            <ChevronDown className="w-5 h-5" />
                          ) : (
                            <ChevronRight className="w-5 h-5" />
                          )}
                        </button>
                      </td>
                      {editingProduct?.id === product.id ? (
                        <>                        
                          <td className="px-6 py-4 whitespace-nowrap">
                            <input
                              type="text"
                              value={editingProduct.name}
                              onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                            />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <input
                              type="text"
                              value={editingProduct.specification}
                              onChange={(e) => setEditingProduct({ ...editingProduct, specification: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                            />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <input
                              type="text"
                              value={editingProduct.unit}
                              onChange={(e) => setEditingProduct({ ...editingProduct, unit: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                            />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            <input
                              type="number"
                              min="0"
                              value={editingProduct.stock ?? 0}
                              onChange={(e) => setEditingProduct({ ...editingProduct, stock: parseFloat(e.target.value) })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-right"
                            />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            <input
                              type="number"
                              value={editingProduct.costPrice}
                              step="0.0001"
                              onChange={(e) => setEditingProduct({ ...editingProduct, costPrice: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-right"
                            />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <button
                              onClick={handleUpdateProduct}
                              className="text-green-600 hover:text-green-900 mr-3"
                            >
                              <Save className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => setEditingProduct(null)}
                              className="text-gray-600 hover:text-gray-900"
                            >
                              <X className="w-5 h-5" />
                            </button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-6 py-4 whitespace-nowrap">{product.name}</td>
                        <td className="px-6 py-4 whitespace-nowrap">{product.specification}</td>
                        <td className="px-6 py-4 whitespace-nowrap">{product.unit}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">{product.stock || 0}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">¥{formatUnitPrice(product.costPrice)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <button
                              onClick={() => setEditingProduct(toEditableProductForm(product))}
                              className="text-blue-600 hover:text-blue-900 mr-3"
                            >
                              <Edit className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => handleDeleteProduct(product.id)}
                              className="text-red-600 hover:text-red-900"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </td>
                        </>
                      )}
                    </tr>
                    
                    {/* Expanded Row for Customer Prices */}
                    {expandedProductId === product.id && (
                      <tr>
                        <td colSpan={7} className="bg-gray-50/80 px-6 py-6 border-b border-gray-200 shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)]">
                          <div className="w-full">
                            <div className="flex items-center justify-between mb-6">
                              <div className="flex items-center gap-3">
                                <div className="w-1 h-6 bg-blue-500 rounded-full"></div>
                                <h4 className="text-base font-semibold text-gray-800">客户特定送货单价</h4>
                              </div>
                              <div className="flex gap-3 bg-white p-1.5 rounded-lg shadow-sm border border-gray-200">
                                <select
                                  value={customerPrice.customerId}
                                  onChange={(e) => setCustomerPrice({ ...customerPrice, customerId: e.target.value })}
                                  className="w-48 px-3 py-1.5 bg-transparent text-sm text-gray-700 focus:outline-none border-r border-gray-200"
                                >
                                  <option value="">选择客户</option>
                                  {customers?.map((customer: Customer) => (
                                    <option key={customer.id} value={customer.id}>{customer.name}</option>
                                  ))}
                                </select>
                                <div className="flex items-center gap-2 px-2">
                                  <span className="text-gray-400 text-sm">¥</span>
                                  <input
                                    type="number"
                                    step="0.0001"
                                    placeholder={`单价 (元/${product.unit})`}
                                    value={customerPrice.price}
                                    onChange={(e) => setCustomerPrice({ ...customerPrice, price: e.target.value })}
                                    className="w-32 text-sm focus:outline-none"
                                  />
                                </div>
                                <button
                                  onClick={handleSetPrice}
                                  disabled={!customerPrice.customerId || customerPrice.price === '' || Number(customerPrice.price) <= 0}
                                  className="px-4 py-1.5 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors"
                                >
                                  <Plus className="w-4 h-4" />
                                  添加
                                </button>
                              </div>
                            </div>
                            
                            {productPrices && productPrices.length > 0 ? (
                              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm w-full">
                                <table className="w-full divide-y divide-gray-100">
                                  <thead className="bg-gray-50/50">
                                    <tr>
                                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/3">客户名称</th>
                                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/3">联系人</th>
                                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-1/6">送货单价 (元/{product.unit})</th>
                                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-1/6 pr-8">操作</th>
                                    </tr>
                                  </thead>
                                  <tbody className="bg-white divide-y divide-gray-50">
                                    {productPrices.map((price: ProductPrice) => (
                                      <tr key={price.id} className="hover:bg-gray-50/50 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">{price.customer?.name}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{price.customer?.contactPerson || '-'}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold text-gray-900">¥{formatUnitPrice(price.price)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium pr-8">
                                          <button
                                            onClick={() => handleDeletePrice(price.id)}
                                            className="text-gray-400 hover:text-red-600 p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                                            title="删除"
                                          >
                                            <Trash2 className="w-4 h-4" />
                                          </button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <div className="flex flex-col items-center justify-center py-12 bg-white rounded-xl border border-gray-200 border-dashed w-full">
                                <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mb-3">
                                  <DollarSign className="w-6 h-6 text-gray-400" />
                                </div>
                                <p className="text-sm text-gray-500 font-medium">暂无客户特定价格</p>
                                <p className="text-xs text-gray-400 mt-1">请在上方选择客户并添加价格</p>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          ) : null}
        </div>
      </div>

      {/* 添加产品模态框 */}
      {showAddModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">添加产品</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">产品名称</label>
                <input
                  type="text"
                  value={newProduct.name}
                  onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">规格</label>
                <input
                  type="text"
                  value={newProduct.specification}
                  onChange={(e) => setNewProduct({ ...newProduct, specification: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">单位</label>
                <input
                  type="text"
                  value={newProduct.unit}
                  onChange={(e) => setNewProduct({ ...newProduct, unit: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">初始库存</label>
                <input
                  type="number"
                  min="0"
                  value={newProduct.stock}
                  onChange={(e) => setNewProduct({ ...newProduct, stock: Number(e.target.value) })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">入库单价 (元/单位)</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={newProduct.costPrice}
                    onChange={(e) => setNewProduct({ ...newProduct, costPrice: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  />
              </div>
            </div>
            <div className="flex justify-end mt-6">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 mr-3"
              >
                取消
              </button>
              <button
                onClick={handleAddProduct}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                添加产品
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default Products;
