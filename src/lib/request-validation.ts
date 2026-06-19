import { NextResponse } from "next/server";
import { z } from "zod";

import { rejectLargeRequestBody } from "@/lib/request-security";

const DEFAULT_JSON_BODY_LIMIT_BYTES = 256 * 1024;

function toIssueMessage(error: z.ZodError) {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "request";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

export function validateSearchParams<T extends z.ZodTypeAny>(
  searchParams: URLSearchParams,
  schema: T
) {
  const input = Object.fromEntries(searchParams.entries());
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: toIssueMessage(parsed.error) || "Invalid query string." },
        { status: 400 }
      ),
    };
  }

  return {
    ok: true as const,
    data: parsed.data,
  };
}

export async function validateJsonBody<T extends z.ZodTypeAny>(
  request: Request,
  schema: T,
  options: { maxBytes?: number } = {}
) {
  const tooLarge = rejectLargeRequestBody(
    request,
    options.maxBytes ?? DEFAULT_JSON_BODY_LIMIT_BYTES,
    "JSON request body"
  );
  if (tooLarge) {
    return {
      ok: false as const,
      response: tooLarge,
    };
  }

  const body = await request.json().catch(() => undefined);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: toIssueMessage(parsed.error) || "Invalid request body." },
        { status: 400 }
      ),
    };
  }

  return {
    ok: true as const,
    data: parsed.data,
  };
}

export const uuidParamSchema = z.string().uuid();
