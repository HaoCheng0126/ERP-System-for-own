import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, DollarSign, Edit, Package, Plus, Save, Trash2, X } from 'lucide-react';
import ActionableEmptyState from '../components/ActionableEmptyState';
import FilterPanel, { ActiveFilter, FilterField, SearchInput } from '../components/FilterPanel';
import QueryStateBanner from '../components/QueryStateBanner';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import api from '../utils/api';
import { formatEditableDecimal, formatUnitPrice } from '../utils/format';
import { isNonZeroAmount, matchesKeyword } from '../utils/filtering';
import useDebouncedValue from '../hooks/useDebouncedValue';
import { useCounterparties } from '../hooks/useCounterparties';
import { Product, ProductType, Customer, CustomerType, ProductPrice } from '../types';

type StockFilter = 'all' | 'inStock' | 'outOfStock';
type ProductTypeFilter = 'all' | ProductType;

type ProductFormState = Omit<
  Product,
  'id' | 'isActive' | 'createdAt' | 'updatedAt' | 'productPrices' | 'costPrice' | 'basePrice' | 'stock' | 'lowStockThreshold'
> & {
  costPrice: string | number;
  basePrice: string | number;
  stock: string | number;
  lowStockThreshold: string | number | null;
};

type EditableProductState = ProductFormState & { id: string };

const createEmptyProductForm = (): ProductFormState => ({
  name: '',
  specification: '',
  unit: '',
  type: ProductType.FINISHED,
  costPrice: '',
  basePrice: '',
  stock: 0,
  lowStockThreshold: '',
});

const toEditableProductForm = (product: Product): EditableProductState => ({
  ...product,
  costPrice: formatEditableDecimal(product.costPrice),
  basePrice: formatEditableDecimal(product.basePrice ?? 0),
  stock: product.stock ?? 0,
  lowStockThreshold: product.lowStockThreshold ?? '',
});

const Products: React.FC = () => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<EditableProductState | null>(null);
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);
  const [newProduct, setNewProduct] = useState<ProductFormState>(createEmptyProductForm());
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<ProductTypeFilter>('all');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const debouncedSearchTerm = useDebouncedValue(searchTerm);

  const [customerPrice, setCustomerPrice] = useState<{ customerId: string; price: string | number }>({
    customerId: '',
    price: '',
  });
  // 行内编辑某条客户特定单价：记录正在编辑的价格行 id 与编辑值
  const [editingPrice, setEditingPrice] = useState<{ id: string; value: string } | null>(null);

  const queryClient = useQueryClient();

  // 获取产品列表
  const { data: products, isLoading, error, refetch } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const response = await api.get('/products');
      return response.data;
    },
  });

  // 获取客户列表（仅客户类型，供产品报价使用）
  const { data: customers } = useCounterparties(CustomerType.CLIENT);

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
      queryClient.invalidateQueries({ queryKey: ['inventoryStats'] });
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
      queryClient.invalidateQueries({ queryKey: ['inventoryStats'] });
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
      queryClient.invalidateQueries({ queryKey: ['inventoryStats'] });
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
      queryClient.invalidateQueries({ queryKey: ['deliveryOrders'] });
      queryClient.invalidateQueries({ queryKey: ['salesStats'] });
      queryClient.invalidateQueries({ queryKey: ['customerStats'] });
      queryClient.invalidateQueries({ queryKey: ['reconciliation'] });
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
      queryClient.invalidateQueries({ queryKey: ['deliveryOrders'] });
      queryClient.invalidateQueries({ queryKey: ['salesStats'] });
      queryClient.invalidateQueries({ queryKey: ['customerStats'] });
      queryClient.invalidateQueries({ queryKey: ['reconciliation'] });
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

  // 保存行内编辑的客户单价：复用按 customerId upsert 的设价接口
  const handleSaveEditPrice = (price: ProductPrice) => {
    if (!editingPrice || editingPrice.id !== price.id) return;
    if (!(Number(editingPrice.value) > 0)) return;
    setPriceMutation.mutate(
      { customerId: price.customerId, price: editingPrice.value },
      { onSuccess: () => setEditingPrice(null) },
    );
  };

  const filteredProducts = ((products || []) as Product[]).filter((product) => {
    const keywordMatch = matchesKeyword(debouncedSearchTerm, [
      product.name,
      product.specification,
      product.unit,
    ]);
    const stockValue = Number(product.stock || 0);
    const stockMatch =
      stockFilter === 'all' ||
      (stockFilter === 'inStock' && isNonZeroAmount(stockValue)) ||
      (stockFilter === 'outOfStock' && !isNonZeroAmount(stockValue));
    const typeMatch = typeFilter === 'all' || (product.type || ProductType.FINISHED) === typeFilter;
    return keywordMatch && stockMatch && typeMatch;
  });

  const clearFilters = () => {
    setSearchTerm('');
    setTypeFilter('all');
    setStockFilter('all');
  };

  const activeFilters: ActiveFilter[] = [
    searchTerm
      ? {
          key: 'keyword',
          label: `关键词: ${searchTerm}`,
          onRemove: () => setSearchTerm(''),
        }
      : null,
    stockFilter !== 'all'
      ? {
          key: 'stock',
          label: `库存: ${stockFilter === 'inStock' ? '有库存' : '无库存'}`,
          onRemove: () => setStockFilter('all'),
        }
      : null,
    typeFilter !== 'all'
      ? {
          key: 'type',
          label: `类型: ${typeFilter === ProductType.RAW_MATERIAL ? '原材料' : '成品'}`,
          onRemove: () => setTypeFilter('all'),
        }
      : null,
  ].filter((item): item is ActiveFilter => Boolean(item));

  return (
    <Layout>
      <PageHeader 
        title="产品管理" 
        subtitle="管理您的产品信息和规格" 
        action={{ label: '添加产品', onClick: () => setShowAddModal(true) }}
      />
      
      <div className="px-4 pb-4 pt-0 md:px-6 md:pb-6">
        <QueryStateBanner
          isLoading={isLoading}
          isError={Boolean(error)}
          loadingText="正在同步产品资料..."
          errorText="产品资料暂时无法同步，请确认后端服务已启动。"
          onRetry={() => refetch()}
        />
        <div className="-mx-4 overflow-hidden border-b border-line bg-white md:-mx-6">
          <FilterPanel
            totalCount={(products || []).length}
            filteredCount={filteredProducts.length}
            activeFilters={activeFilters}
            onClear={clearFilters}
            primary={
              <>
                <FilterField label="关键词" className="lg:w-72">
                  <SearchInput
                    value={searchTerm}
                    onChange={setSearchTerm}
                    placeholder="产品名称、规格、单位"
                  />
                </FilterField>
                <FilterField label="库存状态" className="lg:w-40">
                  <select
                    value={stockFilter}
                    onChange={(e) => setStockFilter(e.target.value as StockFilter)}
                    className="block min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                  >
                    <option value="all">全部</option>
                    <option value="inStock">有库存</option>
                    <option value="outOfStock">无库存</option>
                  </select>
                </FilterField>
                <FilterField label="产品类型" className="lg:w-40">
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value as ProductTypeFilter)}
                    className="block min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                  >
                    <option value="all">全部</option>
                    <option value={ProductType.FINISHED}>成品</option>
                    <option value={ProductType.RAW_MATERIAL}>原材料</option>
                  </select>
                </FilterField>
              </>
            }
          />
          {!isLoading && filteredProducts.length === 0 ? (
            <div className="p-6">
              <ActionableEmptyState
                icon={Package}
                title={(products || []).length ? '没有符合筛选条件的产品' : '先添加第一个产品'}
                description={(products || []).length ? '当前筛选下没有产品，清除筛选后可查看全部产品规格。' : '产品名称、规格、单位和入库单价是入库单、送货单、库存和工资计算的基础。'}
                actionLabel={(products || []).length ? '清除筛选' : '添加产品'}
                onAction={() => {
                  if ((products || []).length) {
                    clearFilters();
                    return;
                  }
                  setShowAddModal(true);
                }}
              />
            </div>
          ) : filteredProducts.length > 0 ? (
          <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[900px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="w-10 px-6 py-3"></th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">产品名称</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">规格</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">类型</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">单位</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">当前库存</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">入库单价 (元/单位)</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredProducts.map((product: Product) => (
                  <React.Fragment key={product.id}>
                    <tr className={expandedProductId === product.id ? 'bg-blue-50' : ''}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {(product.type || ProductType.FINISHED) === ProductType.FINISHED ? (
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
                        ) : (
                          <span className="block w-5" />
                        )}
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
                            <select
                              value={editingProduct.type || ProductType.FINISHED}
                              onChange={(e) => setEditingProduct({ ...editingProduct, type: e.target.value as ProductType })}
                              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                            >
                              <option value={ProductType.FINISHED}>成品</option>
                              <option value={ProductType.RAW_MATERIAL}>原材料</option>
                            </select>
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
                            <input
                              type="number"
                              min="0"
                              step="0.0001"
                              value={editingProduct.lowStockThreshold ?? ''}
                              onChange={(e) => setEditingProduct({ ...editingProduct, lowStockThreshold: e.target.value })}
                              placeholder="安全库存"
                              title="安全库存：库存低于此值时仪表盘预警，留空不预警"
                              className="mt-1 w-full px-3 py-1.5 border border-gray-200 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-xs text-right text-amber-700 placeholder:text-gray-400"
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
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                            (product.type || ProductType.FINISHED) === ProductType.RAW_MATERIAL
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-blue-100 text-blue-700'
                          }`}>
                            {(product.type || ProductType.FINISHED) === ProductType.RAW_MATERIAL ? '原材料' : '成品'}
                          </span>
                        </td>
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
                    {expandedProductId === product.id && (product.type || ProductType.FINISHED) === ProductType.FINISHED && (
                      <tr>
                        <td colSpan={8} className="bg-gray-50/80 px-6 py-6 border-b border-gray-200 shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)]">
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
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold text-gray-900">
                                          {editingPrice?.id === price.id ? (
                                            <input
                                              type="number"
                                              step="0.0001"
                                              autoFocus
                                              value={editingPrice.value}
                                              onChange={(e) => setEditingPrice({ id: price.id, value: e.target.value })}
                                              onKeyDown={(e) => {
                                                if (e.key === 'Enter') handleSaveEditPrice(price);
                                                if (e.key === 'Escape') setEditingPrice(null);
                                              }}
                                              className="w-28 rounded-md border border-blue-300 px-2 py-1 text-right text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                            />
                                          ) : (
                                            <>¥{formatUnitPrice(price.price)}</>
                                          )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium pr-8">
                                          {editingPrice?.id === price.id ? (
                                            <div className="inline-flex items-center gap-1">
                                              <button
                                                onClick={() => handleSaveEditPrice(price)}
                                                className="text-gray-400 hover:text-green-600 p-1.5 hover:bg-green-50 rounded-lg transition-colors"
                                                title="保存"
                                              >
                                                <Save className="w-4 h-4" />
                                              </button>
                                              <button
                                                onClick={() => setEditingPrice(null)}
                                                className="text-gray-400 hover:text-gray-600 p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                                                title="取消"
                                              >
                                                <X className="w-4 h-4" />
                                              </button>
                                            </div>
                                          ) : (
                                            <div className="inline-flex items-center gap-1">
                                              <button
                                                onClick={() => setEditingPrice({ id: price.id, value: formatEditableDecimal(price.price) })}
                                                className="text-gray-400 hover:text-blue-600 p-1.5 hover:bg-blue-50 rounded-lg transition-colors"
                                                title="编辑"
                                              >
                                                <Edit className="w-4 h-4" />
                                              </button>
                                              <button
                                                onClick={() => handleDeletePrice(price.id)}
                                                className="text-gray-400 hover:text-red-600 p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                                                title="删除"
                                              >
                                                <Trash2 className="w-4 h-4" />
                                              </button>
                                            </div>
                                          )}
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

          <div className="space-y-3 p-3 md:hidden">
            {filteredProducts.map((product: Product) => {
              const isEditing = editingProduct?.id === product.id;
              const isFinished = (product.type || ProductType.FINISHED) === ProductType.FINISHED;
              const isRaw = (product.type || ProductType.FINISHED) === ProductType.RAW_MATERIAL;
              const isExpanded = expandedProductId === product.id;
              return (
                <div key={product.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  {isEditing ? (
                    <div className="space-y-3">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-500">产品名称</label>
                        <input
                          type="text"
                          value={editingProduct.name}
                          onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-500">类型</label>
                          <select
                            value={editingProduct.type || ProductType.FINISHED}
                            onChange={(e) => setEditingProduct({ ...editingProduct, type: e.target.value as ProductType })}
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                          >
                            <option value={ProductType.FINISHED}>成品</option>
                            <option value={ProductType.RAW_MATERIAL}>原材料</option>
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-500">单位</label>
                          <input
                            type="text"
                            value={editingProduct.unit}
                            onChange={(e) => setEditingProduct({ ...editingProduct, unit: e.target.value })}
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-500">规格</label>
                        <input
                          type="text"
                          value={editingProduct.specification}
                          onChange={(e) => setEditingProduct({ ...editingProduct, specification: e.target.value })}
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-500">当前库存</label>
                          <input
                            type="number"
                            min="0"
                            value={editingProduct.stock ?? 0}
                            onChange={(e) => setEditingProduct({ ...editingProduct, stock: parseFloat(e.target.value) })}
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-500">入库单价</label>
                          <input
                            type="number"
                            step="0.0001"
                            value={editingProduct.costPrice}
                            onChange={(e) => setEditingProduct({ ...editingProduct, costPrice: e.target.value })}
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-500">安全库存（可选，库存低于此值预警）</label>
                        <input
                          type="number"
                          min="0"
                          step="0.0001"
                          value={editingProduct.lowStockThreshold ?? ''}
                          onChange={(e) => setEditingProduct({ ...editingProduct, lowStockThreshold: e.target.value })}
                          placeholder="留空表示不预警"
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                        />
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={handleUpdateProduct}
                          className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
                        >
                          <Save className="h-4 w-4" />
                          保存
                        </button>
                        <button
                          onClick={() => setEditingProduct(null)}
                          className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                        >
                          <X className="h-4 w-4" />
                          取消
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-base font-semibold text-gray-900">{product.name}</span>
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                                isRaw ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                              }`}
                            >
                              {isRaw ? '原材料' : '成品'}
                            </span>
                          </div>
                          <div className="mt-1 text-sm text-gray-500">
                            规格 {product.specification || '-'} · 单位 {product.unit || '-'}
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <button
                            onClick={() => setEditingProduct(toEditableProductForm(product))}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-blue-600 hover:bg-blue-50"
                            aria-label="编辑"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteProduct(product.id)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-red-600 hover:bg-red-50"
                            aria-label="删除"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-3 rounded-lg bg-gray-50 p-3">
                        <div>
                          <div className="text-xs text-gray-500">当前库存</div>
                          <div className="mt-0.5 text-sm font-semibold tabular-nums text-gray-900">{product.stock || 0}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-gray-500">入库单价</div>
                          <div className="mt-0.5 text-sm font-semibold tabular-nums text-gray-900">¥{formatUnitPrice(product.costPrice)}</div>
                        </div>
                      </div>
                      {isFinished && (
                        <>
                          <button
                            onClick={() => handleToggleExpand(product.id)}
                            className="mt-3 flex w-full items-center justify-center gap-1 border-t border-gray-100 pt-3 text-sm font-medium text-blue-600"
                          >
                            {isExpanded ? '收起客户送货单价' : '客户特定送货单价'}
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                          {isExpanded && (
                            <div className="mt-3 space-y-3">
                              <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                                <select
                                  value={customerPrice.customerId}
                                  onChange={(e) => setCustomerPrice({ ...customerPrice, customerId: e.target.value })}
                                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                                >
                                  <option value="">选择客户</option>
                                  {customers?.map((customer: Customer) => (
                                    <option key={customer.id} value={customer.id}>
                                      {customer.name}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  type="number"
                                  step="0.0001"
                                  placeholder={`单价 (元/${product.unit})`}
                                  value={customerPrice.price}
                                  onChange={(e) => setCustomerPrice({ ...customerPrice, price: e.target.value })}
                                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                                />
                                <button
                                  onClick={handleSetPrice}
                                  disabled={!customerPrice.customerId || customerPrice.price === '' || Number(customerPrice.price) <= 0}
                                  className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <Plus className="h-4 w-4" />
                                  添加客户价
                                </button>
                              </div>
                              {productPrices && productPrices.length > 0 ? (
                                <div className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200">
                                  {productPrices.map((price: ProductPrice) => (
                                    <div key={price.id} className="flex items-center justify-between gap-2 px-3 py-2.5">
                                      <div className="min-w-0">
                                        <div className="truncate text-sm font-medium text-gray-900">{price.customer?.name}</div>
                                        {price.customer?.contactPerson && (
                                          <div className="text-xs text-gray-400">{price.customer.contactPerson}</div>
                                        )}
                                      </div>
                                      <div className="flex shrink-0 items-center gap-2">
                                        {editingPrice?.id === price.id ? (
                                          <>
                                            <input
                                              type="number"
                                              step="0.0001"
                                              autoFocus
                                              value={editingPrice.value}
                                              onChange={(e) => setEditingPrice({ id: price.id, value: e.target.value })}
                                              onKeyDown={(e) => {
                                                if (e.key === 'Enter') handleSaveEditPrice(price);
                                                if (e.key === 'Escape') setEditingPrice(null);
                                              }}
                                              className="w-24 rounded-md border border-blue-300 px-2 py-1 text-right text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                            />
                                            <button
                                              onClick={() => handleSaveEditPrice(price)}
                                              className="text-gray-400 hover:text-green-600"
                                              aria-label="保存"
                                            >
                                              <Save className="h-4 w-4" />
                                            </button>
                                            <button
                                              onClick={() => setEditingPrice(null)}
                                              className="text-gray-400 hover:text-gray-600"
                                              aria-label="取消"
                                            >
                                              <X className="h-4 w-4" />
                                            </button>
                                          </>
                                        ) : (
                                          <>
                                            <span className="text-sm font-semibold tabular-nums text-gray-900">¥{formatUnitPrice(price.price)}</span>
                                            <button
                                              onClick={() => setEditingPrice({ id: price.id, value: formatEditableDecimal(price.price) })}
                                              className="text-gray-400 hover:text-blue-600"
                                              aria-label="编辑"
                                            >
                                              <Edit className="h-4 w-4" />
                                            </button>
                                            <button
                                              onClick={() => handleDeletePrice(price.id)}
                                              className="text-gray-400 hover:text-red-600"
                                              aria-label="删除"
                                            >
                                              <Trash2 className="h-4 w-4" />
                                            </button>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="rounded-lg border border-dashed border-gray-200 px-3 py-6 text-center text-sm text-gray-400">
                                  暂无客户特定价格
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
          </>
          ) : null}
        </div>
      </div>

      {/* 添加产品模态框 */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-gray-600 bg-opacity-50 sm:items-center sm:p-4">
          <div className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border bg-white p-5 shadow-lg sm:max-w-md sm:rounded-lg">
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
                <label className="block text-sm font-medium text-gray-700">产品类型</label>
                <select
                  value={newProduct.type}
                  onChange={(e) => setNewProduct({ ...newProduct, type: e.target.value as ProductType })}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                >
                  <option value={ProductType.FINISHED}>成品</option>
                  <option value={ProductType.RAW_MATERIAL}>原材料</option>
                </select>
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
              <div>
                <label className="block text-sm font-medium text-gray-700">安全库存（可选）</label>
                <input
                  type="number"
                  min="0"
                  step="0.0001"
                  value={newProduct.lowStockThreshold ?? ''}
                  onChange={(e) => setNewProduct({ ...newProduct, lowStockThreshold: e.target.value })}
                  placeholder="库存低于此值时预警"
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
