import { Download, Share2, X } from 'lucide-react';
import { canShareFiles } from '../utils/printShare';

type ExportActionDialogProps = {
  title: string;
  description: string;
  isProcessing?: boolean;
  onSave: () => void;
  onShare: () => void;
  onClose: () => void;
};

const ExportActionDialog: React.FC<ExportActionDialogProps> = ({
  title,
  description,
  isProcessing = false,
  onSave,
  onShare,
  onClose,
}) => {
  // 手机端导出图片（微信发送/存相册体验好），电脑端导出 PDF
  const fileLabel = canShareFiles() ? '图片' : 'PDF';
  return (
  <div className="fixed inset-0 z-50 overflow-y-auto">
    <div className="flex min-h-full items-end justify-center px-4 pb-6 pt-4 text-center sm:items-center sm:p-6">
      <button
        type="button"
        className="fixed inset-0 cursor-default bg-gray-900/45"
        aria-label="关闭导出选项"
        onClick={isProcessing ? undefined : onClose}
      />

      <div className="relative w-full max-w-md overflow-hidden rounded-t-2xl bg-white text-left shadow-xl sm:rounded-xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900">{title}</h3>
            <p className="mt-1 text-sm text-gray-500">{description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:text-gray-300"
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-3 px-5 py-5">
          <button
            type="button"
            onClick={onSave}
            disabled={isProcessing}
            className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-300"
          >
            <Download className="h-4 w-4" />
            {fileLabel === '图片' ? '保存图片' : '保存为 PDF'}
          </button>
          <button
            type="button"
            onClick={onShare}
            disabled={isProcessing}
            className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-green-300"
          >
            <Share2 className="h-4 w-4" />
            分享{fileLabel}到微信
          </button>
          <p className="text-center text-xs leading-5 text-gray-500">
            会生成{fileLabel}并打开系统分享面板，请选择微信发送或保存。
          </p>
        </div>

        {isProcessing && (
          <div className="border-t border-gray-100 bg-gray-50 px-5 py-3 text-center text-sm text-gray-500">
            正在生成{fileLabel}...
          </div>
        )}
      </div>
    </div>
  </div>
  );
};

export default ExportActionDialog;
