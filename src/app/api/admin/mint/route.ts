import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireRouteAccess } from "@/lib/api-authorization";
import { isTrustedRequestOrigin } from "@/lib/http-origin";
import { validateJsonBody } from "@/lib/request-validation";
import { sanitizeAttachmentFilename } from "@/lib/security";
import { isSupabaseAdminAvailable, supabaseAdmin } from "@/lib/supabase-admin";

const MIN_QTY = 1;
const MAX_QTY = 20000;
const LABEL_MAX = 64;

const mintRequestSchema = z.object({
  label: z.string().trim().max(LABEL_MAX).optional().default(""),
  qty: z.coerce.number().int().min(MIN_QTY).max(MAX_QTY),
});

function sanitizeLabel(raw: string) {
  return raw.trim().slice(0, LABEL_MAX);
}

function getUtcDayBounds(value: string) {
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  const start = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 1);
  return { start, end };
}

async function getBatchIndexForDay(batchId: string, createdAt: string) {
  const bounds = getUtcDayBounds(createdAt);
  if (!bounds) return null;

  const { data, error } = await supabaseAdmin
    .from("hardware_tag_batches")
    .select("id, created_at")
    .gte("created_at", bounds.start.toISOString())
    .lt("created_at", bounds.end.toISOString())
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (error || !data) return null;
  const index = data.findIndex((row) => row.id === batchId);
  if (index === -1) return null;
  return index + 1;
}

function csvEscape(value: unknown) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
}

export async function GET() {
  return NextResponse.json(
    { error: "Use POST for minting operations." },
    { status: 405, headers: { Allow: "POST" } }
  );
}

export async function POST(req: NextRequest) {
  if (!isSupabaseAdminAvailable) {
    return NextResponse.json(
      { error: "Admin minting is not configured." },
      { status: 500 }
    );
  }

  if (!isTrustedRequestOrigin(req)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const access = await requireRouteAccess("POST /api/admin/mint");
  if (access instanceof NextResponse) {
    return access;
  }

  const parsedBody = await validateJsonBody(req, mintRequestSchema);
  if (!parsedBody.ok) {
    return parsedBody.response;
  }

  const label = sanitizeLabel(parsedBody.data.label);
  const safeLabel = label || new Date().toISOString().slice(0, 10);

  const { data, error } = await supabaseAdmin.rpc("mint_linkets_csv", {
    p_qty: Math.trunc(parsedBody.data.qty),
    p_batch_label: label || null,
  });
  if (error) {
    return NextResponse.json(
      { error: error.message || "Mint failed." },
      { status: 500 }
    );
  }

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
  const rows = Array.isArray(data) ? data : [];
  const csv = [
    columns.join(","),
    ...rows.map((row) => {
      const record = {
        ...(row as Record<string, unknown>),
        claimed: "no",
      };
      return columns.map((key) => csvEscape(record[key])).join(",");
    }),
  ].join("\n");

  const batchId = (rows[0] as { batch_id?: string } | undefined)?.batch_id ?? null;
  let batchIndex: number | null = null;
  if (batchId) {
    const { data: batchRow } = await supabaseAdmin
      .from("hardware_tag_batches")
      .select("created_at")
      .eq("id", batchId)
      .limit(1)
      .maybeSingle();
    if (batchRow?.created_at) {
      batchIndex = await getBatchIndexForDay(batchId, batchRow.created_at);
    }
  }

  const suffix = batchIndex ? `_b${String(batchIndex).padStart(2, "0")}` : "";
  const filename = sanitizeAttachmentFilename(
    `linkets_${safeLabel.replace(/\s+/g, "_")}${suffix}_${Math.trunc(parsedBody.data.qty)}.csv`,
    "linkets.csv"
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
