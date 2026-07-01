import test from "node:test";
import assert from "node:assert/strict";

import {
  extractResumeStoragePath,
  isOwnedResumeStorageUrl,
  isResumeProfileLink,
} from "../src/lib/profile-link-resume";

test("recognizes explicitly typed resume links", () => {
  assert.equal(
    isResumeProfileLink({
      link_type: "resume",
      title: "Career history",
      url: "https://example.com/file",
    }),
    true
  );
});

test("recognizes legacy resume storage URLs saved as ordinary links", () => {
  assert.equal(
    isResumeProfileLink({
      link_type: "link",
      title: "My resume",
      url: "https://example.supabase.co/storage/v1/object/public/profile-resumes/user/resume.pdf",
    }),
    true
  );
});

test("does not route ordinary profile links through the resume endpoint", () => {
  assert.equal(
    isResumeProfileLink({
      link_type: "link",
      title: "Portfolio",
      url: "https://example.com",
    }),
    false
  );
});

test("extracts an object path from a legacy public Storage URL", () => {
  assert.equal(
    extractResumeStoragePath(
      "https://example.supabase.co/storage/v1/object/public/profile-resumes/user-id/profile-id/resume.pdf"
    ),
    "user-id/profile-id/resume.pdf"
  );
});

test("preserves a valid object path without treating URLs as paths", () => {
  assert.equal(
    extractResumeStoragePath("user-id/profile-id/resume.pdf"),
    "user-id/profile-id/resume.pdf"
  );
});

test("accepts resume URLs only when the object belongs to the profile", () => {
  const url =
    "https://example.supabase.co/storage/v1/object/public/profile-resumes/user-id/profile-id/resume.pdf";

  assert.equal(
    isOwnedResumeStorageUrl(url, "user-id", "profile-id"),
    true
  );
  assert.equal(
    isOwnedResumeStorageUrl(url, "different-user", "profile-id"),
    false
  );
});
