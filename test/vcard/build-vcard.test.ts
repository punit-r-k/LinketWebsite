import test from "node:test";
import assert from "node:assert/strict";

import { buildVCard } from "../../src/lib/vcard/buildVCard";
import type { ContactProfile } from "../../src/lib/profile.store";

function profileWithPhoto(photo: ContactProfile["photo"]): ContactProfile {
  return {
    handle: "punit",
    firstName: "Punit",
    lastName: "Kothakonda",
    photo,
  };
}

test("embeds a saved contact-page photo data URL", () => {
  const photoData = "data:image/jpeg;base64,ZmFrZS1waG90bw==";
  const vcard = buildVCard(profileWithPhoto({ dataUrl: photoData }));

  assert.match(vcard, /^VERSION:3\.0\r$/m);
  assert.match(vcard, /PHOTO;ENCODING=b;TYPE=JPEG:ZmFrZS1waG90bw==/);
});

test("preserves supported embedded photo types", () => {
  const photoData = "data:image/png;base64,ZmFrZS1waG90bw==";
  const vcard = buildVCard(profileWithPhoto({ dataUrl: photoData }));

  assert.match(vcard, /PHOTO;ENCODING=b;TYPE=PNG:ZmFrZS1waG90bw==/);
});

test("does not embed remote or inherited photo URLs", () => {
  const vcard = buildVCard(
    profileWithPhoto({ url: "https://example.com/avatar.jpg", mime: "image/jpeg" })
  );

  assert.doesNotMatch(vcard, /^PHOTO/m);
  assert.doesNotMatch(vcard, /avatar\.jpg/);
});

test("includes the contact name in full and structured fields", () => {
  const vcard = buildVCard({
    handle: "punit",
    firstName: "Punit Anand",
    lastName: "Kothakonda",
  });

  assert.match(vcard, /^FN:Punit Anand Kothakonda\r$/m);
  assert.match(vcard, /^N:Kothakonda;Punit Anand;;;\r$/m);
});
