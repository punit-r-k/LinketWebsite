import "server-only";

import { revalidatePath } from "next/cache";

export function revalidatePublicProfileHandle(
  handle: string | null | undefined
) {
  const normalized = handle?.trim().toLowerCase();
  if (!normalized) return;

  revalidatePath(`/${encodeURIComponent(normalized)}`);
}

export function revalidatePublicProfileHandles(
  ...handles: Array<string | null | undefined>
) {
  const seen = new Set<string>();
  for (const handle of handles) {
    const normalized = handle?.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    revalidatePublicProfileHandle(normalized);
  }
}
