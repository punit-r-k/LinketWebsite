import type { Lead } from "@/types/db";

function escapeVCardValue(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

export function getLeadContactFileName(lead: Lead) {
  const baseName =
    (lead.name || "linket-contact").trim().replace(/\s+/g, "-") ||
    "linket-contact";
  return `${baseName}.vcf`;
}

export function buildLeadVCard(lead: Lead) {
  const name = (lead.name || "").trim();
  const parts = name.split(/\s+/).filter(Boolean);
  const firstName = parts[0] || "";
  const lastName = parts.length > 1 ? parts[parts.length - 1] : "";
  const middleName = parts.length > 2 ? parts.slice(1, -1).join(" ") : "";
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${escapeVCardValue(name || "Linket Contact")}`,
    `N:${escapeVCardValue(lastName)};${escapeVCardValue(firstName)};${escapeVCardValue(middleName)};;`,
  ];
  if (lead.email) lines.push(`EMAIL;TYPE=INTERNET:${escapeVCardValue(lead.email)}`);
  if (lead.phone) lines.push(`TEL;TYPE=CELL:${escapeVCardValue(lead.phone)}`);
  if (lead.company) lines.push(`ORG:${escapeVCardValue(lead.company)}`);
  if (lead.message) lines.push(`NOTE:${escapeVCardValue(lead.message)}`);
  lines.push("END:VCARD");
  return lines.join("\n");
}

function createLeadVCardBlob(lead: Lead) {
  return new Blob([buildLeadVCard(lead)], {
    type: "text/vcard;charset=utf-8;",
  });
}

export function downloadLeadVCard(
  lead: Lead,
  options: { openInsteadOfDownload?: boolean } = {}
) {
  const url = URL.createObjectURL(createLeadVCardBlob(lead));

  if (options.openInsteadOfDownload) {
    window.location.href = url;
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return;
  }

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = getLeadContactFileName(lead);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function saveLeadContactToPhone(lead: Lead) {
  const fileName = getLeadContactFileName(lead);
  const file = new File([createLeadVCardBlob(lead)], fileName, {
    type: "text/vcard",
  });

  if (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] })
  ) {
    await navigator.share({
      files: [file],
      title: lead.name || "Linket contact",
      text: "Save this lead as a contact.",
    });
    return "shared" as const;
  }

  downloadLeadVCard(lead, { openInsteadOfDownload: true });
  return "opened" as const;
}
