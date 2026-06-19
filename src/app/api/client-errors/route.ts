import { NextRequest, NextResponse } from "next/server";
import { resolveCorsHeaders } from "@/lib/cors";
import {
  getRequestBodySizeIssue,
  rejectUntrustedWrite,
} from "@/lib/request-security";
import { forwardClientErrorToSentry } from "@/lib/sentry-forwarder";

type ClientErrorBody = {
  message?: string;
  name?: string | null;
  stack?: string | null;
  source?: string | null;
  componentStack?: string | null;
  level?: "error" | "warning";
  href?: string | null;
  userAgent?: string | null;
  timestamp?: string | null;
};

const MAX_CLIENT_ERROR_BODY_BYTES = 64 * 1024;

function sanitize(value: unknown, max = 2000): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
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
    if (untrusted) return jsonWithCors(request, { ok: false, error: "Request origin is not trusted." }, { status: 403 });

    const sizeIssue = getRequestBodySizeIssue(
      request,
      MAX_CLIENT_ERROR_BODY_BYTES,
      "Client error payload"
    );
    if (sizeIssue) {
      return jsonWithCors(
        request,
        { ok: false, error: sizeIssue.error },
        { status: sizeIssue.status }
      );
    }

    const body = (await request.json().catch(() => ({}))) as ClientErrorBody;
    const message = sanitize(body.message, 2000);
    if (!message) {
      return jsonWithCors(
        request,
        { ok: false, error: "message is required" },
        { status: 400 }
      );
    }

    const payload = {
      message,
      name: sanitize(body.name, 180) || null,
      stack: sanitize(body.stack, 12000) || null,
      source: sanitize(body.source, 500) || null,
      componentStack: sanitize(body.componentStack, 12000) || null,
      level: body.level === "warning" ? "warning" : "error",
      href: sanitize(body.href, 1024) || null,
      userAgent: sanitize(body.userAgent, 512) || null,
      timestamp: sanitize(body.timestamp, 80) || null,
    } as const;

    console.error("Client error captured", {
      name: payload.name || "Error",
      message: payload.message,
      source: payload.source,
      href: payload.href,
    });

    try {
      await forwardClientErrorToSentry(payload);
    } catch (error) {
      console.warn(
        "Client error forwarding failed:",
        error instanceof Error ? error.message : "unknown"
      );
    }

    return jsonWithCors(request, { ok: true });
  } catch (error) {
    return jsonWithCors(
      request,
      { ok: false, error: error instanceof Error ? error.message : "Unable to process client error" },
      { status: 500 }
    );
  }
}
