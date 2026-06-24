import React, { useState } from 'react';
import { X } from 'lucide-react';

export interface QuickCreateProductDraft {
  name: string;
  specification: string;
  unit: string;
  price: number;
}

interface QuickCreateProductFormProps {
  initialName?: string;
  priceLabel: string;
  onCancel: () => void;
  onConfirm: (draft: QuickCreateProductDraft) => void;
}

const inputClassName =
  'block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none';

// 送货单/入库单内联新建产品的快速表单：仅收集名称/规格/单位/单价并回传草稿，
// 不直接调用接口——由父级随单据一起原子提交，避免提交失败时残留孤儿产品。
const QuickCreateProductForm: React.FC<QuickCreateProductFormProps> = ({
  initialName = '',
  priceLabel,
  onCancel,
  onConfirm,
}) => {
  const [name, setName] = useState(initialName);
  const [specification, setSpecification] = useState('');
  const [unit, setUnit] = useState('');
  const [price, setPrice] = useState('');
  const [error, setError] = useState('');

  const handleConfirm = () => {
    const trimmedName = name.trim();
    const trimmedSpec = specification.trim();
    const trimmedUnit = unit.trim();
    if (!trimmedName || !trimmedSpec || !trimmedUnit) {
      setError('请填写名称、规格和单位');
      return;
    }
    const parsedPrice = Number(price);
    if (price !== '' && (Number.isNaN(parsedPrice) || parsedPrice < 0)) {
      setError('单价必须是不小于0的数字');
      return;
    }
    onConfirm({
      name: trimmedName,
      specification: trimmedSpec,
      unit: trimmedUnit,
      price: price === '' ? 0 : parsedPrice,
    });
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/40 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h4 className="text-base font-semibold text-gray-900">新建产品</h4>
          <button type="button" onClick={onCancel} className="text-gray-400 transition-colors hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">名称</label>
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={inputClassName}
              placeholder="产品名称"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">规格</label>
            <input
              value={specification}
              onChange={(event) => setSpecification(event.target.value)}
              className={inputClassName}
              placeholder="规格型号"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">单位</label>
              <input
                value={unit}
                onChange={(event) => setUnit(event.target.value)}
                className={inputClassName}
                placeholder="如 个 / kg"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">{priceLabel}</label>
              <input
                type="number"
                step="0.0001"
                min="0"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                className={inputClassName}
                placeholder="0"
              />
            </div>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            确认新建
          </button>
        </div>
      </div>
    </div>
  );
};

export default QuickCreateProductForm;
