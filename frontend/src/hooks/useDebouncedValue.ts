import { useEffect, useState } from 'react';

const useDebouncedValue = <T,>(value: T, delayMs = 250) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => window.clearTimeout(timerId);
  }, [delayMs, value]);

  return debouncedValue;
};

export default useDebouncedValue;
