import React from 'react';
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';

interface QueryStateBannerProps {
  isLoading?: boolean;
  isError?: boolean;
  loadingText?: string;
  errorText?: string;
  onRetry?: () => void;
}

const QueryStateBanner: React.FC<QueryStateBannerProps> = ({
  isLoading,
  isError,
  loadingText = '正在同步数据...',
  errorText = '暂时无法连接后端，请检查服务是否已启动。',
  onRetry,
}) => {
  if (!isLoading && !isError) return null;

  if (isError) {
    return (
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          <span>{errorText}</span>
        </div>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            重试
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mb-4 inline-flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-4 py-2 text-sm text-blue-700">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>{loadingText}</span>
    </div>
  );
};

export default QueryStateBanner;
