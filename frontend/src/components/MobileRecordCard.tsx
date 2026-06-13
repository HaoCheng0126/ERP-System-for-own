import React from 'react';

interface MobileRecordCardProps {
  children: React.ReactNode;
  className?: string;
}

interface MobileFieldProps {
  label: string;
  value: React.ReactNode;
  align?: 'left' | 'right';
}

export const MobileRecordCard: React.FC<MobileRecordCardProps> = ({ children, className = '' }) => (
  <div className={`rounded-xl border border-gray-200 bg-white p-4 shadow-sm ${className}`}>{children}</div>
);

export const MobileField: React.FC<MobileFieldProps> = ({ label, value, align = 'left' }) => (
  <div className={align === 'right' ? 'text-right' : ''}>
    <div className="text-xs text-gray-500">{label}</div>
    <div className="mt-1 break-words text-sm font-medium text-gray-900">{value}</div>
  </div>
);

export const MobileFieldGrid: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => <div className={`grid grid-cols-2 gap-3 ${className}`}>{children}</div>;

export const MobileActionBar: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => <div className={`mt-4 flex flex-wrap gap-2 border-t border-gray-100 pt-3 ${className}`}>{children}</div>;
