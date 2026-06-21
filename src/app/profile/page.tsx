import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import ProfilesContent from "@/components/dashboard/profiles/ProfilesContent";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Profile settings | Linket Connect",
  robots: {
    index: false,
    follow: false,
  },
};

const SESSION_COOKIES = ["sb-access-token", "sb:token", "sb-refresh-token", "supabase-auth-token"] as const;

async function ensureSession() {
  const store = await cookies();
  const hasSession = SESSION_COOKIES.some((key) => store.has(key));
  if (!hasSession) {
    redirect(`/auth?view=signin&next=${encodeURIComponent("/profile")}`);
  }
}

export default async function ProfilePage() {
  await ensureSession();

  return (
    <section className="mx-auto flex min-h-[70vh] max-w-6xl flex-col gap-6 px-4 py-12 md:px-6 lg:px-8">
      <header>
        <h1 className="text-fluid-3xl-4xl font-display tracking-tight text-foreground">Profile settings</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Update your Linket profile details, design, and contact links. Changes go live instantly on every scan.
        </p>
      </header>
      <Card className="border-border/60 bg-card/80 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold text-muted-foreground">Active profiles</CardTitle>
        </CardHeader>
        <CardContent className="-mx-2 -my-4 sm:m-0">
          <Suspense
            fallback={
              <div className="space-y-4 p-4 sm:p-6">
                <div className="h-6 w-48 animate-pulse rounded-full bg-muted" />
                <div className="h-40 rounded-2xl border border-dashed border-muted" />
              </div>
            }
          >
            <ProfilesContent />
          </Suspense>
        </CardContent>
      </Card>
    </section>
  );
}
