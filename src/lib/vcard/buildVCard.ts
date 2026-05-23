import type { ContactProfile, Address, Email, Phone } from "@/lib/profile.store";
import { escapeText } from "./escape";
import { foldLine } from "./fold";

function joinCRLF(lines: string[]): string {
  return lines.join("\r\n") + "\r\n"; // ensure trailing CRLF
}

function toN(p: ContactProfile): string {
  // N:Family;Given;Additional;Prefix;Suffix
  return [escapeText(p.lastName), escapeText(p.firstName), escapeText(p.middleName), escapeText(p.prefix), escapeText(p.suffix)].join(";");
}

function toFN(p: ContactProfile): string {
  const parts = [p.prefix, p.firstName, p.middleName, p.lastName, p.suffix].filter(Boolean);
  return escapeText(parts.join(" ").replace(/\s+/g, " ")) || escapeText(p.handle);
}

function toAdr(a?: Address): string | null {
  if (!a) return null;
  const fields = [a.pobox, a.ext, a.street, a.city, a.region, a.postcode, a.country].map(escapeText);
  return fields.join(";");
}

function normalizeTel(v: string): string {
  // Very light normalization to digits + leading +
  const trimmed = v.trim();
  if (trimmed.startsWith("+")) return "+" + trimmed.replace(/[^0-9]/g, "");
  return trimmed.replace(/[^0-9]/g, "");
}

function toTel(t: Phone): string {
  const types = [t.type.toUpperCase(), t.pref ? "PREF" : null]
    .filter(Boolean)
    .join(",");
  const value = normalizeTel(t.value);
  return `TEL;TYPE=${types}:${escapeText(value)}`;
}

function toEmail(e: Email): string {
  const locationType = e.type === "personal" ? "HOME" : "WORK";
  const types = ["INTERNET", locationType, e.pref ? "PREF" : null]
    .filter(Boolean)
    .join(",");
  return `EMAIL;TYPE=${types}:${escapeText(e.value)}`;
}

function toVCardPhotoType(mime: string | undefined) {
  const normalized = mime?.trim().toLowerCase();
  if (normalized === "image/png") return "PNG";
  if (normalized === "image/gif") return "GIF";
  if (normalized === "image/webp") return "WEBP";
  return "JPEG";
}

function toPhoto(p: ContactProfile): string | null {
  if (!p.photo) return null;
  const maxEmbeddedPhotoBytes = 500 * 1024;
  const trimmedDataUrl = p.photo.dataUrl?.trim() ?? "";
  const dataUrlMatch = trimmedDataUrl.match(/^data:([^;,]+);base64,([\s\S]+)$/i);
  const mime = p.photo.mime || dataUrlMatch?.[1] || undefined;
  const base64 = (dataUrlMatch?.[2] ?? trimmedDataUrl).replace(/\s+/g, "");
  if (!base64 || !/^[a-z0-9+/]+={0,2}$/i.test(base64)) return null;
  if (base64.length * 0.75 > maxEmbeddedPhotoBytes) return null;
  const type = toVCardPhotoType(mime);
  return `PHOTO;ENCODING=b;TYPE=${type}:${base64}`;
}

function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed.replace(/^\/+/, "")}`;
}

function normalizePhoneDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function phoneDigitsMatch(candidate: string, known: string): boolean {
  if (!candidate || !known) return false;
  if (candidate === known) return true;
  const normalizedCandidate =
    candidate.length > 10 ? candidate.slice(-10) : candidate;
  const normalizedKnown = known.length > 10 ? known.slice(-10) : known;
  return normalizedCandidate === normalizedKnown;
}

function lineIsPhoneOnly(line: string, knownPhones: Set<string>): boolean {
  const digits = normalizePhoneDigits(line);
  if (digits.length < 7) return false;
  if (/^\+?[\d().\-\s]{7,}$/.test(line.trim())) return true;
  for (const known of knownPhones) {
    if (phoneDigitsMatch(digits, known)) return true;
  }
  return false;
}

function sanitizeNoteValue(
  rawNote: string | undefined,
  phones: Phone[] | undefined
): string | null {
  const note = rawNote?.trim();
  if (!note) return null;

  const knownPhones = new Set(
    (phones ?? [])
      .map((entry) => normalizePhoneDigits(entry.value ?? ""))
      .filter((digits) => digits.length >= 7)
  );

  const sanitizedLines = note
    .replace(/\r\n/g, "\n")
    .replace(/\\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/^\s*["'`-]*\s*note\s*\\?\s*:\s*/i, ""))
    .map((line) =>
      line.replace(/\b(?:phone(?: number)?|tel|mobile)\s*\\?\s*:\s*/gi, "")
    )
    .map((line) => line.replace(/(?:\+?\d[\d().\-\s]{5,}\d)/g, " "))
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .map((line) => line.replace(/^(?:note|phone(?: number)?|tel|mobile)$/i, "").trim())
    .filter((line) => Boolean(line) && !lineIsPhoneOnly(line, knownPhones));

  const sanitized = sanitizedLines.join("\n").trim();
  return sanitized || null;
}

function deriveLinkLabel(rawTitle: string | undefined, normalizedUrl: string, index: number): string {
  const title = rawTitle?.trim();
  if (title) return title;
  try {
    const hostname = new URL(normalizedUrl).hostname.replace(/^www\./i, "");
    if (hostname) return hostname;
  } catch {
    // Ignore URL parsing errors and fall through to generic label.
  }
  return `Link ${index + 1}`;
}

export function buildVCard(profile: ContactProfile): string {
  const lines: string[] = [];
  lines.push("BEGIN:VCARD");
  lines.push("VERSION:3.0");
  lines.push(`FN:${toFN(profile)}`);
  lines.push(`N:${toN(profile)}`);
  if (profile.org) lines.push(`ORG:${escapeText(profile.org)}`);
  if (profile.title) lines.push(`TITLE:${escapeText(profile.title)}`);
  if (profile.role) lines.push(`ROLE:${escapeText(profile.role)}`);
  (profile.phones || []).forEach((t) => lines.push(toTel(t)));
  (profile.emails || []).forEach((e) => lines.push(toEmail(e)));
  const adr = toAdr(profile.address);
  if (adr) lines.push(`ADR;TYPE=work:${adr}`);
  (profile.links || []).forEach((link, index) => {
    const normalizedUrl = normalizeUrl(link.url);
    if (!normalizedUrl) return;
    const label = deriveLinkLabel(link.title, normalizedUrl, index);
    const group = `item${index + 1}`;
    lines.push(`${group}.URL:${escapeText(normalizedUrl)}`);
    lines.push(`${group}.X-ABLabel:${escapeText(label)}`);
  });
  const sanitizedNote = sanitizeNoteValue(profile.note, profile.phones);
  if (sanitizedNote) lines.push(`NOTE:${escapeText(sanitizedNote)}`);
  const photo = toPhoto(profile);
  if (photo) lines.push(photo);
  lines.push(`UID:${escapeText(profile.uid || "urn:uuid:" + profile.handle)}`);
  lines.push(`REV:${new Date(profile.updatedAt || Date.now()).toISOString()}`);
  lines.push("END:VCARD");

  // Apply folding per line, then join with CRLF
  const folded = lines.flatMap((l) => foldLine(l));
  return joinCRLF(folded);
}
