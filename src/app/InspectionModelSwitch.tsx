"use client";

import { useEffect, useState } from "react";
import Assembly1 from "./assembly1/page";
import Assembly2 from "./assembly2/page";
import Assembly3 from "./assembly3/page";

const LIVE_REFRESH_MS = 1000;

type AssemblySwitchPayload = {
  modelNo?: string | number;
  modelNumber?: string | number;
  common?: {
    modelNo?: string | number;
  };
};

function normalizeModelNo(modelNo: string | number | undefined | null) {
  return String(modelNo ?? "").replace(/\D/g, "");
}

function componentForModel(modelNo: string) {
  if (modelNo === "6630867") return Assembly2;
  if (modelNo === "6630862") return Assembly3;
  return Assembly1;
}

export default function InspectionModelSwitch() {
  const [modelNo, setModelNo] = useState("6630865");

  useEffect(() => {
    let alive = true;

    const refresh = async () => {
      try {
        const response = await fetch("/api/assembly/current", { cache: "no-store" });
        if (!response.ok) return;
        const data: AssemblySwitchPayload = await response.json();
        const nextModelNo = normalizeModelNo(data.modelNo || data.common?.modelNo || data.modelNumber);
        if (alive && nextModelNo && nextModelNo !== "0") setModelNo(nextModelNo);
      } catch (error) {
        if (process.env.NODE_ENV === "development") console.debug("Assembly model refresh skipped:", error);
      }
    };

    refresh();
    const interval = setInterval(refresh, LIVE_REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, []);

  const ActiveAssembly = componentForModel(modelNo);
  return <ActiveAssembly />;
}
