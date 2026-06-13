import React from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, action }) => {
  return (
    <div className="border-b border-gray-200 bg-white px-4 py-4 md:px-8 md:py-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="break-words text-xl font-bold text-gray-800 md:text-2xl">{title}</h1>
          {subtitle && <p className="mt-1 break-words text-sm text-gray-500 md:text-base">{subtitle}</p>}
        </div>
        {action && (
          <button
            onClick={action.onClick}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-700 sm:w-auto"
          >
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
};

export default PageHeader;
