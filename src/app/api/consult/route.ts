import { NextRequest, NextResponse } from "next/server";
import { resolveCorsHeaders } from "@/lib/cors";
import { isSupabaseAdminAvailable, supabaseAdmin } from "@/lib/supabase-admin";
import { limitRequest } from "@/lib/rate-limit";
import {
  getRequestBodySizeIssue,
  rejectUntrustedWrite,
} from "@/lib/request-security";

type ConsultPayload = {
  workEmail: string;
  teamSize: string;
  notes: string;
  website?: string | null;
  pageUrl?: string | null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_CONSULT_BODY_BYTES = 64 * 1024;

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function sendConsultEmail(payload: {
  workEmail: string;
  teamSize: string;
  notes: string;
  pageUrl?: string | null;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { status: "skipped" as const };

  const to = process.env.CONSULTS_TO || "linketconnect@gmail.com";
  const from =
    process.env.CONSULTS_FROM ||
    process.env.LEADS_FROM ||
    "onboarding@resend.dev";

  const subject = "New Linket consult request";
  const safeEmail = escapeHtml(payload.workEmail);
  const safeTeam = escapeHtml(payload.teamSize);
  const safeNotes = escapeHtml(payload.notes);
  const safeUrl = payload.pageUrl ? escapeHtml(payload.pageUrl) : "";

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;">
      <h2>${subject}</h2>
      <p><strong>Work email:</strong> ${safeEmail}</p>
      <p><strong>Team size:</strong> ${safeTeam}</p>
      <p><strong>Notes:</strong><br />${safeNotes.replace(/\n/g, "<br />")}</p>
      ${safeUrl ? `<p><strong>Page URL:</strong> ${safeUrl}</p>` : ""}
    </div>
  `;

  const text = `New Linket consult request
Work email: ${payload.workEmail}
Team size: ${payload.teamSize}
Notes: ${payload.notes}
${payload.pageUrl ? `Page URL: ${payload.pageUrl}` : ""}`.trim();

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      html,
      text,
      reply_to: payload.workEmail,
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    console.warn("Consult email failed:", message);
    return { status: "failed" as const };
  }

  return { status: "sent" as const };
}

async function parsePayload(request: NextRequest): Promise<ConsultPayload> {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = (await request.json()) as Partial<ConsultPayload>;
    return {
      workEmail: normalizeString(body.workEmail),
      teamSize: normalizeString(body.teamSize),
      notes: normalizeString(body.notes),
      website: normalizeString(body.website) || null,
      pageUrl: normalizeString(body.pageUrl) || null,
    };
  }

  const formData = await request.formData();
  return {
    workEmail: normalizeString(formData.get("workEmail")),
    teamSize: normalizeString(formData.get("teamSize")),
    notes: normalizeString(formData.get("notes")),
    website: normalizeString(formData.get("website")) || null,
    pageUrl: normalizeString(formData.get("pageUrl")) || null,
  };
}

function jsonWithCors(request: NextRequest, body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  const headers = resolveCorsHeaders(request.headers.get("origin"), {
    allowMethods: ["OPTIONS", "POST"],
  });
  if (headers) {
    Object.entries(headers).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
  }
  return response;
}

export async function OPTIONS(request: NextRequest) {
  const headers = resolveCorsHeaders(request.headers.get("origin"), {
    allowMethods: ["OPTIONS", "POST"],
  });
  if (!headers) {
    return new NextResponse(null, { status: 204 });
  }
  return new NextResponse(null, { status: 204, headers });
}

export async function POST(request: NextRequest) {
  try {
    const untrusted = rejectUntrustedWrite(request);
    if (untrusted) return jsonWithCors(request, { error: "Request origin is not trusted." }, { status: 403 });

    if (await limitRequest(request, "consult-submit", 8, 60_000)) {
      return jsonWithCors(
        request,
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    const sizeIssue = getRequestBodySizeIssue(
      request,
      MAX_CONSULT_BODY_BYTES,
      "Consult request payload"
    );
    if (sizeIssue) {
      return jsonWithCors(
        request,
        { error: sizeIssue.error },
        { status: sizeIssue.status }
      );
    }

    const payload = await parsePayload(request);
    const { workEmail, teamSize, notes } = payload;

    if (payload.website) {
      return jsonWithCors(request, { ok: true });
    }

    if (!workEmail || !EMAIL_RE.test(workEmail)) {
      return jsonWithCors(
        request,
        { error: "A valid work email is required." },
        { status: 400 }
      );
    }
    if (!teamSize) {
      return jsonWithCors(
        request,
        { error: "Team size is required." },
        { status: 400 }
      );
    }
    if (!notes) {
      return jsonWithCors(request, { error: "Notes are required." }, { status: 400 });
    }

    const insertPayload = {
      work_email: workEmail,
      team_size: teamSize,
      notes,
      page_url: payload.pageUrl ?? null,
      source: "landing-consult",
    };

    if (!isSupabaseAdminAvailable) {
      return jsonWithCors(
        request,
        { error: "Consult requests are not configured." },
        { status: 503 }
      );
    }

    const { error } = await supabaseAdmin
      .from("consult_requests")
      .insert(insertPayload);
    if (error) throw new Error(error.message);

    await sendConsultEmail(payload);

    return jsonWithCors(request, { ok: true });
  } catch (error) {
    console.error("Consult request error:", error);
    return jsonWithCors(
      request,
      { error: "Unable to submit consult request." },
      { status: 500 }
    );
  }
}
