import { useEffect } from "react";

export function useDebounceEffect(
  fn: () => void,
  waitTime: number,
  deps: React.DependencyList,
) {
  useEffect(() => {
    const handler = setTimeout(() => {
      fn();
    }, waitTime);

    return () => {
      clearTimeout(handler);
    };
  }, [fn, waitTime, ...deps]);
}
