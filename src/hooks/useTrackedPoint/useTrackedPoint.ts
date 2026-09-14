'use client';

import { useEffect, useState } from 'react';

/**
 * Re-samples a canvas-space point every animation frame while active, so
 * overlays spawn next to their node and track pan, zoom, and drags. Holds the
 * last point through momentary null samples.
 */
export function useTrackedPoint(
  compute: (() => { x: number; y: number } | null) | null,
): { x: number; y: number } | null {
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!compute) {
      setPoint(null);
      return;
    }
    let raf = 0;
    const tick = () => {
      const next = compute();
      if (next) {
        setPoint((prev) => (prev && Math.abs(prev.x - next.x) < 0.5 && Math.abs(prev.y - next.y) < 0.5 ? prev : next));
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      setPoint(null);
    };
  }, [compute]);
  return point;
}
