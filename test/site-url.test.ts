import test from "node:test";
import assert from "node:assert/strict";

import { toCanonicalPublicProfileUrl } from "../src/lib/site-url";

test("builds canonical public profile share links", () => {
  assert.equal(
    toCanonicalPublicProfileUrl("punit"),
    "https://www.linketconnect.com/punit"
  );
});

test("normalizes surrounding slashes in canonical profile handles", () => {
  assert.equal(
    toCanonicalPublicProfileUrl("/punit/"),
    "https://www.linketconnect.com/punit"
  );
});
