import React from 'react';
import { LucideIcon } from 'lucide-react';

interface ActionableEmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondaryAction?: () => void;
}

const ActionableEmptyState: React.FC<ActionableEmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondaryAction,
}) => {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 px-6 py-14 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white text-blue-600 shadow-sm ring-1 ring-gray-200">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      <p className="mt-2 max-w-xl text-sm leading-6 text-gray-500">{description}</p>
      {(actionLabel || secondaryLabel) && (
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          {actionLabel && onAction && (
            <button
              type="button"
              onClick={onAction}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
            >
              {actionLabel}
            </button>
          )}
          {secondaryLabel && onSecondaryAction && (
            <button
              type="button"
              onClick={onSecondaryAction}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
            >
              {secondaryLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default ActionableEmptyState;
