"use client";

import { useEffect, useRef, useState } from "react";

// Recompute the plot in CSS pixels so labels stay readable as panels reflow.
export function useChartWidth(active: boolean) {
  const ref = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(860);
  useEffect(() => {
    if (!active || !ref.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setWidth(Math.max(220, Math.round(entry.contentRect.width)));
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [active]);
  return { ref, width };
}
