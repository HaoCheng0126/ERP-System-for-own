import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Product } from '../types';

interface ProductAutocompleteProps {
  products?: Product[];
  value: string;
  onSelect: (productId: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  allowCreate?: boolean;
  onCreateNew?: (name: string) => void;
}

const getProductLabel = (product: Product) => `${product.name} - ${product.specification}`;

const normalizeSearchText = (value: string) => value.trim().toLowerCase();

const compactSearchText = (value: string) => normalizeSearchText(value).replace(/\s+/g, '');

const getProductSearchText = (product: Product) =>
  normalizeSearchText(`${product.name} ${product.specification} ${getProductLabel(product)}`);

const productMatchesKeyword = (product: Product, keyword: string) => {
  const normalizedKeyword = normalizeSearchText(keyword);
  if (!normalizedKeyword) return true;

  const searchText = getProductSearchText(product);
  const tokens = normalizedKeyword.split(/\s+/).filter(Boolean);
  if (tokens.every((token) => searchText.includes(token))) {
    return true;
  }

  return compactSearchText(searchText).includes(compactSearchText(normalizedKeyword));
};

const findExactProduct = (products: Product[], keyword: string) => {
  const normalizedKeyword = normalizeSearchText(keyword);
  if (!normalizedKeyword) return undefined;

  const exactFullLabel = products.find((product) => normalizeSearchText(getProductLabel(product)) === normalizedKeyword);
  if (exactFullLabel) return exactFullLabel;

  const exactNameOrSpec = products.filter(
    (product) =>
      normalizeSearchText(product.name) === normalizedKeyword ||
      normalizeSearchText(product.specification) === normalizedKeyword,
  );
  return exactNameOrSpec.length === 1 ? exactNameOrSpec[0] : undefined;
};

const ProductAutocomplete: React.FC<ProductAutocompleteProps> = ({
  products = [],
  value,
  onSelect,
  placeholder = '输入产品名称或规格',
  className = '',
  disabled = false,
  allowCreate = false,
  onCreateNew,
}) => {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const selectedProduct = products.find((product) => product.id === value);
  const [keyword, setKeyword] = useState(selectedProduct ? getProductLabel(selectedProduct) : '');
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const nextProduct = products.find((product) => product.id === value);
    setKeyword(nextProduct ? getProductLabel(nextProduct) : '');
  }, [products, value]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  const filteredProducts = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    if (!normalizedKeyword) {
      return products.slice(0, 20);
    }

    return products.filter((product) => productMatchesKeyword(product, normalizedKeyword)).slice(0, 20);
  }, [keyword, products]);

  const handleKeywordChange = (nextKeyword: string) => {
    setKeyword(nextKeyword);
    setIsOpen(true);

    const exactProduct = findExactProduct(products, nextKeyword);
    if (exactProduct) {
      onSelect(exactProduct.id);
      return;
    }

    if (value) {
      onSelect('');
    }
  };

  const trimmedKeyword = keyword.trim();
  const canCreate = allowCreate && Boolean(trimmedKeyword) && !findExactProduct(products, trimmedKeyword);

  return (
    <div ref={wrapperRef} className="relative">
      <input
        type="text"
        value={keyword}
        disabled={disabled}
        placeholder={placeholder}
        onFocus={() => setIsOpen(true)}
        onChange={(event) => handleKeywordChange(event.target.value)}
        className={className}
      />

      {isOpen && !disabled && (
        <div className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg">
          {filteredProducts.length > 0 ? (
            filteredProducts.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => {
                  onSelect(product.id);
                  setKeyword(getProductLabel(product));
                  setIsOpen(false);
                }}
                className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700"
              >
                <div className="font-medium">{product.name}</div>
                <div className="text-xs text-gray-500">{product.specification}</div>
              </button>
            ))
          ) : (
            !canCreate && <div className="px-3 py-2 text-sm text-gray-500">没有匹配的产品</div>
          )}
          {canCreate && (
            <button
              type="button"
              onClick={() => {
                onCreateNew?.(trimmedKeyword);
                setIsOpen(false);
              }}
              className="block w-full border-t border-gray-100 px-3 py-2 text-left text-sm font-medium text-blue-600 hover:bg-blue-50"
            >
              + 新建产品「{trimmedKeyword}」
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default ProductAutocomplete;
