import { NextResponse } from "next/server";
import { requireRouteAccess } from "@/lib/api-authorization";
import { supabaseAdmin, isSupabaseAdminAvailable } from "@/lib/supabase-admin";

async function removeStorageFolder(bucket: string, prefix: string) {
  const { data, error } = await supabaseAdmin
    .storage
    .from(bucket)
    .list(prefix, { limit: 1000 });
  if (error || !data?.length) return;
  const paths = data.map((item) => `${prefix}/${item.name}`);
  await supabaseAdmin.storage.from(bucket).remove(paths);
}

export async function POST() {
  if (!isSupabaseAdminAvailable) {
    return NextResponse.json(
      { error: "Account deletion is not configured." },
      { status: 500 }
    );
  }

  const access = await requireRouteAccess("POST /api/account/delete");
  if (access instanceof NextResponse) {
    return access;
  }

  const userId = access.user.id;

  try {
    await supabaseAdmin.storage.from("avatars").remove([
      `${userId}/avatar.webp`,
      `${userId}/avatar_128.webp`,
    ]);
    await removeStorageFolder("profile-headers", `${userId}/profile-headers`);
    await removeStorageFolder("profile-logos", `${userId}/profile-logos`);
    await removeStorageFolder("lead-form-uploads", userId);
    await removeStorageFolder("profile-resumes", userId);

    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(
      userId
    );
    if (authDeleteError) throw new Error(authDeleteError.message);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to delete account";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
