import React, { useMemo, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';

type DateFieldProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
  min?: string;
  max?: string;
  id?: string;
  name?: string;
  required?: boolean;
  placeholder?: string;
};

const getDisplayValue = (value: string) => {
  if (!value) {
    return '';
  }

  return value.replace(/-/g, '/');
};

const DateField: React.FC<DateFieldProps> = ({
  value,
  onChange,
  className = '',
  disabled = false,
  min,
  max,
  id,
  name,
  required = false,
  placeholder = '年/月/日',
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  const rootClassName = useMemo(() => {
    const classes = ['relative', className];
    return classes.filter(Boolean).join(' ');
  }, [className]);

  const shellClassName = useMemo(() => {
    const classes = [
      'flex min-h-[42px] items-center justify-between rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm transition-colors',
      isFocused ? 'border-blue-500 ring-1 ring-blue-500' : '',
      disabled ? 'bg-gray-100 text-gray-400' : '',
    ];
    return classes.filter(Boolean).join(' ');
  }, [disabled, isFocused]);

  const openPicker = () => {
    if (disabled || !inputRef.current) {
      return;
    }

    const input = inputRef.current as HTMLInputElement & { showPicker?: () => void };
    input.focus({ preventScroll: true });

    if (typeof input.showPicker === 'function') {
      try {
        input.showPicker();
      } catch {
        // Browsers that don't support showPicker will still use their native date input behavior.
      }
    }
  };

  return (
    <div className={rootClassName}>
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="date"
        value={value}
        min={min}
        max={max}
        required={required}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onClick={openPicker}
        className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
      />

      <div className={shellClassName} aria-hidden="true">
        <span className={value ? 'text-gray-900' : 'text-gray-400'}>{value ? getDisplayValue(value) : placeholder}</span>
        <CalendarDays className="h-4 w-4 shrink-0 text-gray-500" />
      </div>
    </div>
  );
};

export default DateField;
