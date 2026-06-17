import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

export const AUTO_DISMISS_MESSAGE_MS = 5000;

export function useAutoDismissState<T>(
  initialValue: T,
  timeoutMs = AUTO_DISMISS_MESSAGE_MS,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(initialValue);

  useEffect(() => {
    if (!value) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setValue(initialValue);
    }, timeoutMs);

    return () => window.clearTimeout(timeoutId);
  }, [initialValue, timeoutMs, value]);

  return [value, setValue];
}
