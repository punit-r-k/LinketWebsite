import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function NotFound() {
  return (
    <section className="mx-auto max-w-xl px-4 py-16 text-center">
      <Card className="rounded-2xl">
        <CardContent className="p-8">
          <h1 className="text-3xl font-semibold text-[#0f172a]">Page not found</h1>
          <p className="mt-2 text-slate-700">
            This page does not exist. Double check your URL.
          </p>
          <div className="mt-6">
            <Button asChild className="rounded-2xl bg-[#0f172a] text-white hover:bg-[#0f172a]/90">
              <Link href="/">Back home</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
