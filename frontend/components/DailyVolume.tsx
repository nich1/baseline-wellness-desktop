"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { LiftSet } from "@/lib/types";
import { DailyVolumeDistribution } from "./DailyVolumeDistribution";

export function DailyVolume({ date }: { date: string }) {
  const [lifts, setLifts] = useState<LiftSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true, requestId = 0;
    function refresh() {
      const id = ++requestId;
      api.getLifts({ loggedOn: date }).then(data => {
        if (active && id === requestId) { setLifts(data); setError(""); }
      }).catch(() => {
        if (active && id === requestId) setError("Could not load lifts");
      }).finally(() => {
        if (active && id === requestId) setLoading(false);
      });
    }
    refresh();
    window.addEventListener("focus", refresh);
    return () => { active = false; window.removeEventListener("focus", refresh); };
  }, [date]);

  return <DailyVolumeDistribution date={date} lifts={lifts} loadingLifts={loading} liftError={error} />;
}
