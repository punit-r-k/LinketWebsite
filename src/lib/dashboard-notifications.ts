export const ANNOUNCEMENT_AUDIENCES = ["all", "users", "admins"] as const;
export type AnnouncementAudience = (typeof ANNOUNCEMENT_AUDIENCES)[number];

export const ANNOUNCEMENT_SEVERITIES = [
  "info",
  "success",
  "warning",
  "critical",
] as const;
export type AnnouncementSeverity = (typeof ANNOUNCEMENT_SEVERITIES)[number];

export const ANNOUNCEMENT_TITLE_MAX_LENGTH = 120;
export const ANNOUNCEMENT_MESSAGE_MAX_LENGTH = 5000;

export type DashboardAnnouncementRecord = {
  id: string;
  title: string;
  message: string;
  severity: AnnouncementSeverity;
  audience: AnnouncementAudience;
  is_active: boolean;
  send_as_notification: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type DashboardNotificationItem = {
  id: string;
  title: string;
  message: string;
  severity: AnnouncementSeverity;
  createdAt: string;
  updatedAt: string;
  viewedAt?: string | null;
};

export type NormalizedAnnouncementInput = {
  title: string;
  message: string;
  severity: AnnouncementSeverity;
  audience: AnnouncementAudience;
  isActive: boolean;
  sendAsNotification: boolean;
};

export function isAnnouncementAudience(
  value: string
): value is AnnouncementAudience {
  return ANNOUNCEMENT_AUDIENCES.includes(value as AnnouncementAudience);
}

export function isAnnouncementSeverity(
  value: string
): value is AnnouncementSeverity {
  return ANNOUNCEMENT_SEVERITIES.includes(value as AnnouncementSeverity);
}

export function normalizeAnnouncementInput(
  payload: Record<string, unknown>
):
  | { ok: true; value: NormalizedAnnouncementInput }
  | { ok: false; error: string } {
  const titleRaw = typeof payload.title === "string" ? payload.title : "";
  const messageRaw = typeof payload.message === "string" ? payload.message : "";
  const title = titleRaw.trim();
  const message = messageRaw.trim();

  if (!title) {
    return { ok: false, error: "Title is required." };
  }
  if (title.length > ANNOUNCEMENT_TITLE_MAX_LENGTH) {
    return {
      ok: false,
      error: `Title must be ${ANNOUNCEMENT_TITLE_MAX_LENGTH} characters or fewer.`,
    };
  }
  if (!message) {
    return { ok: false, error: "Message is required." };
  }
  if (message.length > ANNOUNCEMENT_MESSAGE_MAX_LENGTH) {
    return {
      ok: false,
      error: `Message must be ${ANNOUNCEMENT_MESSAGE_MAX_LENGTH} characters or fewer.`,
    };
  }

  const severityRaw =
    typeof payload.severity === "string" ? payload.severity : "info";
  const audienceRaw =
    typeof payload.audience === "string" ? payload.audience : "all";
  const severity = isAnnouncementSeverity(severityRaw)
    ? severityRaw
    : "info";
  const audience = isAnnouncementAudience(audienceRaw)
    ? audienceRaw
    : "all";
  const isActive =
    typeof payload.isActive === "boolean" ? payload.isActive : true;
  const sendAsNotification =
    typeof payload.sendAsNotification === "boolean"
      ? payload.sendAsNotification
      : true;

  return {
    ok: true,
    value: {
      title,
      message,
      severity,
      audience,
      isActive,
      sendAsNotification,
    },
  };
}
