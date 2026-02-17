import { useState, useEffect } from "react";

/**
 * Returns a debounced version of the value. Useful for search inputs to avoid
 * triggering filters/fetches on every keystroke.
 * @param value - The value to debounce (e.g. search query)
 * @param delayMs - Debounce delay in milliseconds
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debouncedValue;
}
