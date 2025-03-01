export const debounce = (fn: (...args: string[]) => void, delay: number) => {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: string[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
};
