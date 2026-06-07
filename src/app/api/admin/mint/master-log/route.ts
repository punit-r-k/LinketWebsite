import { NextResponse } from "next/server";
import { requireRouteAccess } from "@/lib/api-authorization";
import { formatClaimCodeDisplay } from "@/lib/linket-claim-code";
import { sanitizeAttachmentFilename } from "@/lib/security";
import { isSupabaseAdminAvailable, supabaseAdmin } from "@/lib/supabase-admin";
import { getConfiguredSiteOrigin } from "@/lib/site-url";

const LABEL_MAX = 64;
const PAGE_SIZE = 1000;

function sanitizeLabel(raw: string) {
  return raw.trim().slice(0, LABEL_MAX);
}

function csvEscape(value: unknown) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function getSiteBase() {
  return getConfiguredSiteOrigin().replace(/\/$/, "");
}

type BatchRow = {
  id: string;
  label: string | null;
  created_at: string | null;
};

type TagRow = {
  id: string;
  public_token: string | null;
  claim_code: string | null;
  batch_id: string | null;
  created_at: string | null;
  status: string | null;
};

function resolveBatchLabel(batch: BatchRow) {
  const safeLabel = sanitizeLabel(batch.label ?? "");
  if (safeLabel) return safeLabel;
  if (batch.created_at) return batch.created_at.slice(0, 10);
  return `batch_${batch.id.slice(0, 8)}`;
}

async function fetchAllBatches() {
  const rows: BatchRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from("hardware_tag_batches")
      .select("id,label,created_at")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      return { data: null, error };
    }

    const page = data ?? [];
    if (page.length === 0) break;
    rows.push(...page);

    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return { data: rows, error: null };
}

async function fetchAllTags() {
  const rows: TagRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from("hardware_tags")
      .select("id, public_token, claim_code, batch_id, created_at, status")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      return { data: null, error };
    }

    const page = data ?? [];
    if (page.length === 0) break;
    rows.push(...page);

    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return { data: rows, error: null };
}

export async function GET() {
  if (!isSupabaseAdminAvailable) {
    return NextResponse.json(
      { error: "Admin minting is not configured." },
      { status: 500 }
    );
  }

  const access = await requireRouteAccess("GET /api/admin/mint/master-log");
  if (access instanceof NextResponse) {
    return access;
  }

  const { data: batches, error: batchesError } = await fetchAllBatches();
  if (batchesError) {
    return NextResponse.json(
      { error: batchesError.message || "Unable to load batches." },
      { status: 500 }
    );
  }

  const batchLabelMap = new Map<string, string>();
  for (const batch of batches ?? []) {
    batchLabelMap.set(batch.id, resolveBatchLabel(batch));
  }

  const { data: tags, error: tagsError } = await fetchAllTags();
  if (tagsError) {
    return NextResponse.json(
      { error: tagsError.message || "Unable to load tags." },
      { status: 500 }
    );
  }

  const baseUrl = getSiteBase();
  const columns = [
    "id",
    "public_token",
    "url",
    "claim_code",
    "claim_code_display",
    "batch_id",
    "batch_label",
    "claimed",
  ];

  const rows = Array.isArray(tags) ? tags : [];
  const csv = [
    columns.join(","),
    ...rows.map((row) => {
      const batchId = row.batch_id ?? "";
      const batchLabel = batchId
        ? batchLabelMap.get(batchId) ?? `batch_${batchId.slice(0, 8)}`
        : "";
      const record = {
        id: row.id,
        public_token: row.public_token ?? "",
        url: row.public_token ? `${baseUrl}/l/${row.public_token}` : "",
        claim_code: row.claim_code ?? "",
        claim_code_display: formatClaimCodeDisplay(row.claim_code),
        batch_id: batchId,
        batch_label: batchLabel,
        claimed: row.status === "claimed" ? "yes" : "no",
      };
      return columns.map((key) => csvEscape(record[key as keyof typeof record])).join(",");
    }),
  ].join("\n");

  const today = new Date().toISOString().slice(0, 10);
  const filename = sanitizeAttachmentFilename(
    `linkets_master_log_${today}.csv`,
    "linkets_master_log.csv"
  );

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
