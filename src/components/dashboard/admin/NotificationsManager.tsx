"use client";

import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Bell, CheckCircle2, Info, Megaphone } from "lucide-react";

import { toast } from "@/components/system/toaster";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SwitchRow } from "@/components/ui/switch-row";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  ANNOUNCEMENT_AUDIENCES,
  ANNOUNCEMENT_MESSAGE_MAX_LENGTH,
  ANNOUNCEMENT_SEVERITIES,
  ANNOUNCEMENT_TITLE_MAX_LENGTH,
  type AnnouncementAudience,
  type AnnouncementSeverity,
  type DashboardAnnouncementRecord,
} from "@/lib/dashboard-notifications";
import { cn } from "@/lib/utils";

type SeverityMeta = {
  label: string;
  className: string;
  icon: LucideIcon;
};

const SEVERITY_META: Record<AnnouncementSeverity, SeverityMeta> = {
  info: {
    label: "Info",
    className: "border-sky-200 bg-sky-100 text-sky-900",
    icon: Info,
  },
  success: {
    label: "Success",
    className: "border-emerald-200 bg-emerald-100 text-emerald-900",
    icon: CheckCircle2,
  },
  warning: {
    label: "Warning",
    className: "border-amber-200 bg-amber-100 text-amber-900",
    icon: AlertTriangle,
  },
  critical: {
    label: "Critical",
    className: "border-rose-200 bg-rose-100 text-rose-900",
    icon: AlertTriangle,
  },
};

const AUDIENCE_LABEL: Record<AnnouncementAudience, string> = {
  all: "All users",
  users: "Non-admin users",
  admins: "Admin users",
};

const CREATED_AT_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export default function NotificationsManager() {
  const [announcements, setAnnouncements] = useState<DashboardAnnouncementRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [severity, setSeverity] = useState<AnnouncementSeverity>("info");
  const [audience, setAudience] = useState<AnnouncementAudience>("all");
  const [isActive, setIsActive] = useState(true);
  const [sendAsNotification, setSendAsNotification] = useState(true);
  const [activeTab, setActiveTab] = useState("write");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const fetchAnnouncements = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/notifications?limit=100", {
        method: "GET",
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          payload && typeof payload.error === "string"
            ? payload.error
            : "Unable to load notifications."
        );
      }
      setAnnouncements(Array.isArray(payload) ? (payload as DashboardAnnouncementRecord[]) : []);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to load notifications.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAnnouncements();
  }, [fetchAnnouncements]);

  const resetComposer = useCallback(() => {
    setTitle("");
    setMessage("");
    setSeverity("info");
    setAudience("all");
    setIsActive(true);
    setSendAsNotification(true);
    setActiveTab("write");
  }, []);

  const formatSelection = useCallback(
    (prefix: string, suffix: string, placeholder: string) => {
      const textarea = textareaRef.current;
      if (!textarea) {
        setMessage((prev) => `${prev}${prefix}${placeholder}${suffix}`);
        return;
      }

      const start = textarea.selectionStart ?? message.length;
      const end = textarea.selectionEnd ?? message.length;
      const selected = message.slice(start, end);
      const wrapped = `${prefix}${selected || placeholder}${suffix}`;
      const nextValue = `${message.slice(0, start)}${wrapped}${message.slice(end)}`;
      setMessage(nextValue);

      const cursor = start + wrapped.length;
      window.requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(cursor, cursor);
      });
    },
    [message]
  );

  const insertLineAtCursor = useCallback(
    (line: string) => {
      const textarea = textareaRef.current;
      if (!textarea) {
        setMessage((prev) => (prev ? `${prev}\n${line}` : line));
        return;
      }

      const start = textarea.selectionStart ?? message.length;
      const end = textarea.selectionEnd ?? message.length;
      const prefix = message.slice(0, start);
      const suffix = message.slice(end);
      const separatorBefore = prefix.endsWith("\n") || prefix.length === 0 ? "" : "\n";
      const separatorAfter = suffix.startsWith("\n") || suffix.length === 0 ? "" : "\n";
      const insertion = `${separatorBefore}${line}${separatorAfter}`;
      const nextValue = `${prefix}${insertion}${suffix}`;
      setMessage(nextValue);

      const cursor = prefix.length + insertion.length;
      window.requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(cursor, cursor);
      });
    },
    [message]
  );

  const handleCreateAnnouncement = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setSaving(true);
      try {
        const response = await fetch("/api/admin/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            message,
            severity,
            audience,
            isActive,
            sendAsNotification,
          }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            payload && typeof payload.error === "string"
              ? payload.error
              : "Unable to create notification."
          );
        }
        const created = payload as DashboardAnnouncementRecord;
        setAnnouncements((prev) => [created, ...prev]);
        toast({
          title: "Notification published",
          description: "Users can now view the latest notification.",
          variant: "success",
        });
        resetComposer();
      } catch (err) {
        const description =
          err instanceof Error ? err.message : "Unable to save notification.";
        toast({
          title: "Publish failed",
          description,
          variant: "destructive",
        });
      } finally {
        setSaving(false);
      }
    },
    [audience, isActive, message, resetComposer, sendAsNotification, severity, title]
  );

  const updateAnnouncement = useCallback(
    async (
      id: string,
      patch: Partial<{
        isActive: boolean;
        sendAsNotification: boolean;
      }>
    ) => {
      try {
        const response = await fetch("/api/admin/notifications", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, ...patch }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            payload && typeof payload.error === "string"
              ? payload.error
              : "Unable to update notification."
          );
        }
        const updated = payload as DashboardAnnouncementRecord;
        setAnnouncements((prev) =>
          prev.map((item) => (item.id === updated.id ? updated : item))
        );
      } catch (err) {
        const description =
          err instanceof Error ? err.message : "Unable to update notification.";
        toast({
          title: "Update failed",
          description,
          variant: "destructive",
        });
      }
    },
    []
  );

  const titleChars = title.length;
  const messageChars = message.length;
  const composerDisabled = saving || loading;

  const sortedAnnouncements = useMemo(
    () =>
      [...announcements].sort((a, b) => {
        return (
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      }),
    [announcements]
  );

  return (
    <div className="space-y-6">
      <Card className="rounded-3xl border border-border/60 bg-card/85 shadow-sm">
        <CardHeader className="space-y-2">
          <CardTitle className="text-xl font-semibold text-foreground">
            Compose notification
          </CardTitle>
          <CardDescription>
            Publish formatted updates that appear in user notifications and dashboard surfaces.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={handleCreateAnnouncement}>
            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="notification-title">Title</Label>
                <Input
                  id="notification-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={ANNOUNCEMENT_TITLE_MAX_LENGTH}
                  placeholder="Platform update for all users"
                  required
                  disabled={composerDisabled}
                />
                <p className="text-xs text-muted-foreground">
                  {titleChars}/{ANNOUNCEMENT_TITLE_MAX_LENGTH}
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Severity</Label>
                  <Select
                    value={severity}
                    onValueChange={(value) => setSeverity(value as AnnouncementSeverity)}
                    disabled={composerDisabled}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ANNOUNCEMENT_SEVERITIES.map((item) => (
                        <SelectItem key={item} value={item}>
                          {SEVERITY_META[item].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Audience</Label>
                  <Select
                    value={audience}
                    onValueChange={(value) => setAudience(value as AnnouncementAudience)}
                    disabled={composerDisabled}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ANNOUNCEMENT_AUDIENCES.map((item) => (
                        <SelectItem key={item} value={item}>
                          {AUDIENCE_LABEL[item]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-3">
              <TabsList>
                <TabsTrigger value="write">Write</TabsTrigger>
                <TabsTrigger value="preview">Preview</TabsTrigger>
              </TabsList>
              <TabsContent value="write" className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => formatSelection("**", "**", "bold text")}
                    disabled={composerDisabled}
                  >
                    Bold
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => formatSelection("_", "_", "italic text")}
                    disabled={composerDisabled}
                  >
                    Italic
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => formatSelection("`", "`", "inline code")}
                    disabled={composerDisabled}
                  >
                    Code
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => insertLineAtCursor("- list item")}
                    disabled={composerDisabled}
                  >
                    Bullet
                  </Button>
                </div>
                <Textarea
                  ref={textareaRef}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  maxLength={ANNOUNCEMENT_MESSAGE_MAX_LENGTH}
                  placeholder="Share product updates, maintenance notices, or onboarding messages."
                  className="min-h-44"
                  required
                  disabled={composerDisabled}
                />
                <p className="text-xs text-muted-foreground">
                  {messageChars}/{ANNOUNCEMENT_MESSAGE_MAX_LENGTH}
                </p>
              </TabsContent>
              <TabsContent value="preview">
                <Card className="rounded-2xl border border-border/60 bg-background/70">
                  <CardContent className="space-y-3 p-4">
                    <NotificationPreview
                      title={title || "Notification title preview"}
                      message={message}
                      severity={severity}
                    />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="grid gap-2">
                <SwitchRow
                  label="Publish immediately"
                  checked={isActive}
                  onCheckedChange={setIsActive}
                  disabled={composerDisabled}
                />
                <SwitchRow
                  label="Show in dashboard notifications"
                  checked={sendAsNotification}
                  onCheckedChange={setSendAsNotification}
                  disabled={composerDisabled}
                />
              </div>
              <Button type="submit" disabled={composerDisabled}>
                {saving ? "Publishing..." : "Publish notification"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="rounded-3xl border border-border/60 bg-card/85 shadow-sm">
        <CardHeader className="space-y-2">
          <CardTitle className="text-xl font-semibold text-foreground">
            Recent notifications
          </CardTitle>
          <CardDescription>
            Manage visibility and notification delivery for existing notifications.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="rounded-2xl border border-dashed border-border/60 px-4 py-10 text-center text-sm text-muted-foreground">
              Loading notifications...
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-4 text-sm text-destructive">
              {error}
            </div>
          ) : sortedAnnouncements.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/60 px-4 py-10 text-center text-sm text-muted-foreground">
              No notifications yet.
            </div>
          ) : (
            sortedAnnouncements.map((item) => {
              const severityMeta = SEVERITY_META[item.severity];
              const SeverityIcon = severityMeta.icon;
              return (
                <article
                  key={item.id}
                  className="rounded-2xl border border-border/60 bg-background/70 p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          className={cn(
                            "gap-1 rounded-full px-2 py-1 text-[11px] font-semibold",
                            severityMeta.className
                          )}
                        >
                          <SeverityIcon className="h-3 w-3" aria-hidden />
                          {severityMeta.label}
                        </Badge>
                        <Badge variant="secondary" className="rounded-full px-2 py-1 text-[11px]">
                          {AUDIENCE_LABEL[item.audience]}
                        </Badge>
                        <Badge variant={item.is_active ? "default" : "outline"}>
                          {item.is_active ? "Active" : "Paused"}
                        </Badge>
                        <Badge
                          variant={item.send_as_notification ? "default" : "outline"}
                          className="gap-1"
                        >
                          <Bell className="h-3 w-3" aria-hidden />
                          {item.send_as_notification ? "In notifications" : "Hidden"}
                        </Badge>
                      </div>
                      <h3 className="text-base font-semibold text-foreground">
                        {item.title}
                      </h3>
                      <FormattedMessage text={item.message} />
                      <p className="text-xs text-muted-foreground">
                        Published {formatTimestamp(item.created_at)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-row gap-2 sm:flex-col">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          void updateAnnouncement(item.id, {
                            isActive: !item.is_active,
                          })
                        }
                      >
                        {item.is_active ? "Pause" : "Activate"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          void updateAnnouncement(item.id, {
                            sendAsNotification: !item.send_as_notification,
                          })
                        }
                      >
                        {item.send_as_notification
                          ? "Hide notification"
                          : "Show notification"}
                      </Button>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function NotificationPreview({
  title,
  message,
  severity,
}: {
  title: string;
  message: string;
  severity: AnnouncementSeverity;
}) {
  const severityMeta = SEVERITY_META[severity];
  const SeverityIcon = severityMeta.icon;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className={cn("gap-1 rounded-full px-2 py-1 text-[11px]", severityMeta.className)}>
          <SeverityIcon className="h-3 w-3" aria-hidden />
          {severityMeta.label}
        </Badge>
        <Badge variant="secondary" className="rounded-full px-2 py-1 text-[11px]">
          <Megaphone className="mr-1 h-3 w-3" aria-hidden />
          Preview
        </Badge>
      </div>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <FormattedMessage text={message || "Your formatted message preview appears here."} />
    </div>
  );
}

function FormattedMessage({ text }: { text: string }) {
  const lines = text.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let listItems: string[] = [];
  let key = 0;

  const flushList = () => {
    if (listItems.length === 0) return;
    const listKey = `list-${key++}`;
    blocks.push(
      <ul key={listKey} className="list-disc space-y-1 pl-5 text-sm text-foreground/90">
        {listItems.map((item, index) => (
          <li key={`${listKey}-${index}`}>{renderInlineFormatting(item)}</li>
        ))}
      </ul>
    );
    listItems = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      continue;
    }
    if (trimmed.startsWith("- ")) {
      listItems.push(trimmed.slice(2));
      continue;
    }
    flushList();
    blocks.push(
      <p key={`p-${key++}`} className="text-sm leading-relaxed text-foreground/90">
        {renderInlineFormatting(trimmed)}
      </p>
    );
  }
  flushList();

  if (blocks.length === 0) {
    return <p className="text-sm text-muted-foreground">No message content.</p>;
  }

  return <div className="space-y-2">{blocks}</div>;
}

function renderInlineFormatting(value: string): React.ReactNode[] {
  const tokenPattern = /(\*\*[^*]+\*\*|_[^_]+_|`[^`]+`)/g;
  const output: React.ReactNode[] = [];
  let cursor = 0;
  let key = 0;

  for (const match of value.matchAll(tokenPattern)) {
    const token = match[0];
    const tokenIndex = match.index ?? 0;
    if (tokenIndex > cursor) {
      output.push(value.slice(cursor, tokenIndex));
    }

    if (token.startsWith("**") && token.endsWith("**")) {
      output.push(
        <strong key={`strong-${key++}`}>{token.slice(2, token.length - 2)}</strong>
      );
    } else if (token.startsWith("_") && token.endsWith("_")) {
      output.push(
        <em key={`em-${key++}`}>{token.slice(1, token.length - 1)}</em>
      );
    } else if (token.startsWith("`") && token.endsWith("`")) {
      output.push(
        <code
          key={`code-${key++}`}
          className="rounded bg-muted px-1 py-0.5 text-[12px] text-foreground"
        >
          {token.slice(1, token.length - 1)}
        </code>
      );
    } else {
      output.push(token);
    }

    cursor = tokenIndex + token.length;
  }

  if (cursor < value.length) {
    output.push(value.slice(cursor));
  }

  return output;
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return CREATED_AT_FORMATTER.format(date);
}
