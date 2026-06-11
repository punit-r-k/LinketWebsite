"use client";

import { useEffect } from "react";

type NetworkConnection = {
  effectiveType?: string;
  saveData?: boolean;
  rtt?: number;
  downlink?: number;
  addEventListener?: (type: "change", listener: () => void) => void;
  removeEventListener?: (type: "change", listener: () => void) => void;
};

const WEAK_TYPES = new Set(["slow-2g", "2g"]);
const PUBLIC_PROFILE_REFRESH_EVENT = "linket:public-profile-refresh";

function getConnection(): NetworkConnection | undefined {
  if (typeof navigator === "undefined") return undefined;
  const nav = navigator as Navigator & {
    connection?: NetworkConnection;
    mozConnection?: NetworkConnection;
    webkitConnection?: NetworkConnection;
  };
  return nav.connection ?? nav.mozConnection ?? nav.webkitConnection;
}

function isWeakConnection(connection: NetworkConnection | undefined) {
  if (!connection) return false;
  if (connection.saveData) return true;
  if (connection.effectiveType && WEAK_TYPES.has(connection.effectiveType)) {
    return true;
  }
  if (typeof connection.downlink === "number" && connection.downlink > 0) {
    return connection.downlink < 0.9;
  }
  if (typeof connection.rtt === "number") {
    return connection.rtt > 800;
  }
  return false;
}

function readLiteOverride() {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("lite");
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "on", "yes"].includes(normalized)) return true;
  if (["0", "false", "off", "no"].includes(normalized)) return false;
  return null;
}

export default function PublicProfileLiteMode() {
  useEffect(() => {
    const root = document.documentElement;
    const override = readLiteOverride();
    if (override !== null) {
      root.dataset.lite = override ? "true" : "false";
      return () => {
        delete root.dataset.lite;
      };
    }

    const reducedDataQuery =
      typeof window !== "undefined" && typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-data: reduce)")
        : null;

    const update = () => {
      const connection = getConnection();
      const prefersReducedData = Boolean(reducedDataQuery?.matches);
      const lite = prefersReducedData || isWeakConnection(connection);
      root.dataset.lite = lite ? "true" : "false";
    };

    update();

    const updateWhenVisible = () => {
      if (document.visibilityState === "hidden") return;
      update();
    };

    const connection = getConnection();
    connection?.addEventListener?.("change", update);
    reducedDataQuery?.addEventListener?.("change", update);
    window.addEventListener("focus", update);
    window.addEventListener("online", update);
    window.addEventListener("pageshow", update);
    window.addEventListener(PUBLIC_PROFILE_REFRESH_EVENT, update);
    document.addEventListener("visibilitychange", updateWhenVisible);

    return () => {
      connection?.removeEventListener?.("change", update);
      reducedDataQuery?.removeEventListener?.("change", update);
      window.removeEventListener("focus", update);
      window.removeEventListener("online", update);
      window.removeEventListener("pageshow", update);
      window.removeEventListener(PUBLIC_PROFILE_REFRESH_EVENT, update);
      document.removeEventListener("visibilitychange", updateWhenVisible);
      delete root.dataset.lite;
    };
  }, []);

  return null;
}

export function signalPublicProfileRefresh() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(PUBLIC_PROFILE_REFRESH_EVENT));
}
