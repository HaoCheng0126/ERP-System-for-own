import React from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

const PageHeader: React.FC<PageHeaderProps> = ({ title, action }) => {
  return (
    <div className="bg-white px-4 py-4 md:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="min-w-0 break-words text-xl font-semibold tracking-tight text-ink md:text-[22px]">{title}</h1>
        {action && (
          <button
            onClick={action.onClick}
            className="inline-flex min-h-10 w-full items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700 active:bg-brand-800 sm:w-auto"
          >
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
};

export default PageHeader;
