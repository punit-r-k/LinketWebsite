import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveVCardName,
  resolveVCardPhotoData,
} from "../../src/lib/vcard/profile-defaults";

const contactPhoto = "data:image/jpeg;base64,Y29udGFjdA==";
const publicProfilePhoto = "data:image/webp;base64,cHJvZmlsZQ==";

test("uses the public-profile editor name when no contact-card name is saved", () => {
  assert.equal(resolveVCardName(null, "  Punit Kothakonda  ", "punit"), "Punit Kothakonda");
});

test("preserves an explicitly saved contact-card name", () => {
  assert.equal(
    resolveVCardName("Punit Anand Kothakonda", "Punit Kothakonda", "punit"),
    "Punit Anand Kothakonda"
  );
});

test("uses the public-profile editor photo when no contact photo is saved", () => {
  assert.equal(
    resolveVCardPhotoData(null, null, publicProfilePhoto),
    publicProfilePhoto
  );
});

test("preserves an explicitly saved contact-card photo", () => {
  assert.equal(
    resolveVCardPhotoData(contactPhoto, null, publicProfilePhoto),
    contactPhoto
  );
});

test("respects explicit contact-photo removal", () => {
  assert.equal(
    resolveVCardPhotoData(null, "2026-06-30T12:00:00.000Z", publicProfilePhoto),
    null
  );
});
