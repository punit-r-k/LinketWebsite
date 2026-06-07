export type SavedAccount = {
  email: string;
  savedAt: string;
  lastUsedAt: string;
};

const SAVED_ACCOUNTS_STORAGE_KEY = "linket:saved-accounts";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function getSavedAccounts(): SavedAccount[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SAVED_ACCOUNTS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is SavedAccount =>
          typeof item === "object" &&
          item !== null &&
          typeof item.email === "string" &&
          typeof item.savedAt === "string" &&
          typeof item.lastUsedAt === "string"
      )
      .sort(
        (a, b) =>
          new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime()
      );
  } catch {
    return [];
  }
}

export function isSavedAccount(email: string) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  return getSavedAccounts().some(
    (account) => normalizeEmail(account.email) === normalized
  );
}

export function saveAccount(email: string) {
  if (typeof window === "undefined") return [];
  const normalized = normalizeEmail(email);
  if (!normalized) return getSavedAccounts();

  const now = new Date().toISOString();
  const existing = getSavedAccounts();
  const next = [
    {
      email: normalized,
      savedAt:
        existing.find((account) => normalizeEmail(account.email) === normalized)
          ?.savedAt ?? now,
      lastUsedAt: now,
    },
    ...existing.filter((account) => normalizeEmail(account.email) !== normalized),
  ].slice(0, 8);

  window.localStorage.setItem(SAVED_ACCOUNTS_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function removeSavedAccount(email: string) {
  if (typeof window === "undefined") return [];
  const normalized = normalizeEmail(email);
  if (!normalized) return getSavedAccounts();

  const next = getSavedAccounts().filter(
    (account) => normalizeEmail(account.email) !== normalized
  );
  if (next.length > 0) {
    window.localStorage.setItem(SAVED_ACCOUNTS_STORAGE_KEY, JSON.stringify(next));
  } else {
    window.localStorage.removeItem(SAVED_ACCOUNTS_STORAGE_KEY);
  }
  return next;
}
