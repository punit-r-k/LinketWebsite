"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase";

const REFRESH_DEBOUNCE_MS = 300;
const SETTLE_REFRESH_MS = 1200;

type PublicProfileRealtimeRefreshProps = {
  profileId: string;
  userId: string;
  leadFormId?: string | null;
};

export default function PublicProfileRealtimeRefresh({
  profileId,
  userId,
  leadFormId,
}: PublicProfileRealtimeRefreshProps) {
  const router = useRouter();

  useEffect(() => {
    if (!profileId || !userId || !canUseRealtime()) return;

    let refreshTimer: number | null = null;
    let settleTimer: number | null = null;
    let pendingWhileHidden = false;

    const clearRefreshTimers = () => {
      if (refreshTimer !== null) {
        window.clearTimeout(refreshTimer);
        refreshTimer = null;
      }
      if (settleTimer !== null) {
        window.clearTimeout(settleTimer);
        settleTimer = null;
      }
    };

    const queueRefresh = () => {
      if (document.visibilityState === "hidden") {
        pendingWhileHidden = true;
        clearRefreshTimers();
        return;
      }

      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        router.refresh();
      }, REFRESH_DEBOUNCE_MS);

      if (settleTimer !== null) window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => {
        settleTimer = null;
        router.refresh();
      }, SETTLE_REFRESH_MS);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible" || !pendingWhileHidden) return;
      pendingWhileHidden = false;
      queueRefresh();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    let channel = supabase
      .channel(`public-profile-refresh-${profileId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "user_profiles",
          filter: `id=eq.${profileId}`,
        },
        queueRefresh
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "profile_links",
          filter: `profile_id=eq.${profileId}`,
        },
        queueRefresh
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "profile_links",
          filter: `profile_id=eq.${profileId}`,
        },
        queueRefresh
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "lead_forms",
          filter: `profile_id=eq.${profileId}`,
        },
        queueRefresh
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "vcard_profiles",
          filter: `user_id=eq.${userId}`,
        },
        queueRefresh
      );

    if (leadFormId) {
      channel = channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "lead_forms",
          filter: `id=eq.${leadFormId}`,
        },
        queueRefresh
      );
    }

    channel.subscribe((status) => {
      if (status === "CHANNEL_ERROR") {
        console.warn(
          "Realtime unavailable for public profile auto-refresh; continuing without live updates."
        );
      }
    });

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearRefreshTimers();
      void supabase.removeChannel(channel);
    };
  }, [leadFormId, profileId, router, userId]);

  return null;
}

function canUseRealtime() {
  if (typeof window === "undefined") return false;
  if (typeof window.WebSocket !== "function") return false;
  if (window.isSecureContext) return true;

  const hostname = window.location.hostname.toLowerCase();
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".local")
  );
}
