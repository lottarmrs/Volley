import { useLayoutEffect, useState } from 'react';

export function useElementWidth(padrao: number) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [largura, setLargura] = useState(padrao);
  useLayoutEffect(() => {
    if (!el || typeof ResizeObserver === 'undefined') return;
    const medir = () => {
      const { width } = el.getBoundingClientRect();
      if (width) setLargura(width);
    };
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    return () => observador.disconnect();
  }, [el]);
  return [setEl, largura] as const;
}
