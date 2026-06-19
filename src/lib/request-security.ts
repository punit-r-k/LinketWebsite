import "server-only";

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { isTrustedRequestOrigin } from "@/lib/http-origin";
import { hasAmbiguousRequestBodyHeaders } from "@/lib/security";

export function rejectUntrustedWrite(request: NextRequest) {
  if (isTrustedRequestOrigin(request)) {
    return null;
  }

  return NextResponse.json(
    { error: "Request origin is not trusted." },
    { status: 403 }
  );
}

export function getRequestBodySizeIssue(
  request: Request,
  maxBytes: number,
  label = "Request body"
) {
  if (hasAmbiguousRequestBodyHeaders(request.headers)) {
    return {
      error: "Request body headers are ambiguous.",
      status: 400,
    } as const;
  }

  const rawLength = request.headers.get("content-length")?.trim();
  if (!rawLength) return null;
  if (!/^\d+$/.test(rawLength)) {
    return {
      error: "Request body size is invalid.",
      status: 400,
    } as const;
  }

  const length = Number(rawLength);
  if (!Number.isSafeInteger(length) || length < 0) {
    return {
      error: "Request body size is invalid.",
      status: 400,
    } as const;
  }

  if (length > maxBytes) {
    return {
      error: `${label} is too large.`,
      status: 413,
    } as const;
  }

  return null;
}

export function rejectLargeRequestBody(
  request: Request,
  maxBytes: number,
  label = "Request body"
) {
  const issue = getRequestBodySizeIssue(request, maxBytes, label);
  if (!issue) return null;
  return NextResponse.json({ error: issue.error }, { status: issue.status });
}
