import test from "node:test";
import assert from "node:assert/strict";

import {
  hasAmbiguousRequestBodyHeaders,
  hashIdentifier,
  sanitizeAttachmentFilename,
  sanitizePublicLinkUrl,
} from "../../src/lib/security";
import {
  assertSafeCorsConfig,
  getCorsConfig,
  isCrossOriginRequest,
  resolveCorsHeaders,
} from "../../src/lib/cors";
import { readBearerTokenFromHeaders } from "../../src/lib/supabase/auth-token";

function setEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

test("ambiguous content-length and transfer-encoding headers are rejected", () => {
  assert.equal(
    hasAmbiguousRequestBodyHeaders(
      new Headers({
        "content-length": "10",
        "transfer-encoding": "chunked",
      })
    ),
    true
  );
  assert.equal(
    hasAmbiguousRequestBodyHeaders(new Headers({ "content-length": "10" })),
    false
  );
});

test("unsafe public profile links are rejected", () => {
  assert.throws(() => sanitizePublicLinkUrl("javascript:alert(1)"));
  assert.throws(() => sanitizePublicLinkUrl("data:text/html,<script>alert(1)</script>"));
  assert.throws(() => sanitizePublicLinkUrl("https://"));
  assert.equal(
    sanitizePublicLinkUrl("https://example.com/path?q=1"),
    "https://www.example.com/path?q=1"
  );
  assert.equal(
    sanitizePublicLinkUrl("https://www.example.com/path?q=1"),
    "https://www.example.com/path?q=1"
  );
  assert.equal(
    sanitizePublicLinkUrl("https://shop.example.com/path?q=1"),
    "https://shop.example.com/path?q=1"
  );
});

test("attachment filenames are normalized to prevent header injection", () => {
  assert.equal(
    sanitizeAttachmentFilename('evil"\r\nSet-Cookie: pwn=1.csv', "fallback.csv"),
    "evilSet-Cookie_pwn_1.csv"
  );
});

test("production CORS forbids wildcard origins", () => {
  const originalEnv = process.env.NODE_ENV;
  const originalOrigins = process.env.CORS_ALLOWED_ORIGINS;
  const originalCredentials = process.env.CORS_ALLOW_CREDENTIALS;

  setEnv("NODE_ENV", "production");
  process.env.CORS_ALLOWED_ORIGINS = "*";
  process.env.CORS_ALLOW_CREDENTIALS = "true";

  try {
    assert.throws(() => assertSafeCorsConfig());
  } finally {
    setEnv("NODE_ENV", originalEnv);
    process.env.CORS_ALLOWED_ORIGINS = originalOrigins;
    process.env.CORS_ALLOW_CREDENTIALS = originalCredentials;
  }
});

test("development CORS can allow explicit localhost origins", () => {
  const originalEnv = process.env.NODE_ENV;
  const originalAppEnv = process.env.APP_ENV;
  const originalOrigins = process.env.CORS_ALLOWED_ORIGINS;
  const originalDevelopmentOrigins =
    process.env.CORS_ALLOWED_ORIGINS_DEVELOPMENT;
  const originalCredentials = process.env.CORS_ALLOW_CREDENTIALS;

  setEnv("NODE_ENV", "development");
  setEnv("APP_ENV", "development");
  process.env.CORS_ALLOWED_ORIGINS = "";
  process.env.CORS_ALLOWED_ORIGINS_DEVELOPMENT = "http://localhost:3000";
  process.env.CORS_ALLOW_CREDENTIALS = "false";

  try {
    assert.equal(getCorsConfig().environment, "development");
    const headers = resolveCorsHeaders("http://localhost:3000", {
      allowMethods: ["OPTIONS", "POST"],
    });
    assert.ok(headers);
    assert.equal(headers?.["Access-Control-Allow-Origin"], "http://localhost:3000");
  } finally {
    setEnv("NODE_ENV", originalEnv);
    setEnv("APP_ENV", originalAppEnv);
    process.env.CORS_ALLOWED_ORIGINS = originalOrigins;
    process.env.CORS_ALLOWED_ORIGINS_DEVELOPMENT = originalDevelopmentOrigins;
    process.env.CORS_ALLOW_CREDENTIALS = originalCredentials;
  }
});

test("staging and production select their own allowlists", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAppEnv = process.env.APP_ENV;
  const originalGeneralOrigins = process.env.CORS_ALLOWED_ORIGINS;
  const originalStagingOrigins = process.env.CORS_ALLOWED_ORIGINS_STAGING;
  const originalProductionOrigins =
    process.env.CORS_ALLOWED_ORIGINS_PRODUCTION;

  setEnv("NODE_ENV", "production");
  process.env.CORS_ALLOWED_ORIGINS = "https://fallback.example";
  process.env.CORS_ALLOWED_ORIGINS_STAGING = "https://preview.example";
  process.env.CORS_ALLOWED_ORIGINS_PRODUCTION = "https://app.example";

  try {
    setEnv("APP_ENV", "staging");
    assert.equal(getCorsConfig().environment, "staging");
    assert.deepEqual(getCorsConfig().allowedOrigins, ["https://preview.example"]);

    setEnv("APP_ENV", "production");
    assert.equal(getCorsConfig().environment, "production");
    assert.deepEqual(getCorsConfig().allowedOrigins, ["https://app.example"]);
  } finally {
    setEnv("NODE_ENV", originalNodeEnv);
    setEnv("APP_ENV", originalAppEnv);
    process.env.CORS_ALLOWED_ORIGINS = originalGeneralOrigins;
    process.env.CORS_ALLOWED_ORIGINS_STAGING = originalStagingOrigins;
    process.env.CORS_ALLOWED_ORIGINS_PRODUCTION = originalProductionOrigins;
  }
});

test("cross-origin requests are detected correctly", () => {
  assert.equal(
    isCrossOriginRequest("https://evil.example", "https://app.example/api/me"),
    true
  );
  assert.equal(
    isCrossOriginRequest("https://app.example", "https://app.example/api/me"),
    false
  );
});

test("bearer tokens are parsed from authorization headers", () => {
  assert.equal(
    readBearerTokenFromHeaders(
      new Headers({ Authorization: "Bearer example.jwt.token" })
    ),
    "example.jwt.token"
  );
  assert.equal(
    readBearerTokenFromHeaders(new Headers({ Authorization: "Basic abc123" })),
    null
  );
});

test("salted identifiers are deterministic within the same day", async () => {
  const one = await hashIdentifier("127.0.0.1");
  const two = await hashIdentifier("127.0.0.1");
  assert.equal(one, two);
  assert.notEqual(one, await hashIdentifier("127.0.0.2"));
});
