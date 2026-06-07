"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/system/toaster";

type MintControlsProps = {
  defaultQty: number;
  defaultLabel: string;
};

const MIN_QTY = 1;
const MAX_QTY = 20000;
const LABEL_MAX = 64;

function sanitizeLabel(raw: string) {
  return raw.trim().slice(0, LABEL_MAX);
}

function clampQty(value: number) {
  if (!Number.isFinite(value)) return MIN_QTY;
  return Math.min(MAX_QTY, Math.max(MIN_QTY, Math.trunc(value)));
}

function makeFilenameFromHeader(header: string | null, fallback: string) {
  if (!header) return fallback;
  try {
    const match = header.match(/filename\*?=(?:UTF-8'')?([^;]+)/i);
    if (!match) return fallback;
    const value = decodeURIComponent(match[1].trim().replace(/^"|"$/g, ""));
    return value || fallback;
  } catch {
    return fallback;
  }
}

export default function MintControls({ defaultQty, defaultLabel }: MintControlsProps) {
  const router = useRouter();
  const [qty, setQty] = useState<number>(defaultQty);
  const [label, setLabel] = useState<string>(defaultLabel);
  const [pending, setPending] = useState(false);
  const [batchIndex, setBatchIndex] = useState<number | null>(null);
  const [batchIndexLabel, setBatchIndexLabel] = useState<string | null>(null);

  const filenameFallback = useMemo(() => {
    const safeLabel = sanitizeLabel(label) || new Date().toISOString().slice(0, 10);
    const safeQty = clampQty(qty);
    const index = batchIndex ? `b${String(batchIndex).padStart(2, "0")}` : "bXX";
    return `linkets_${safeLabel.replace(/\s+/g, "_")}_${index}_${safeQty}.csv`;
  }, [label, qty, batchIndex]);

  useEffect(() => {
    const controller = new AbortController();
    const safeLabel = sanitizeLabel(label) || new Date().toISOString().slice(0, 10);

    const timeout = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ label: safeLabel });
        const response = await fetch(`/api/admin/mint/next-batch?${params.toString()}`, {
          credentials: "include",
          signal: controller.signal,
        });
        if (!response.ok) {
          setBatchIndex(null);
          setBatchIndexLabel(null);
          return;
        }
        const payload = (await response.json()) as {
          nextIndex?: number;
          date?: string;
        };
        if (typeof payload.nextIndex === "number") {
          setBatchIndex(payload.nextIndex);
          setBatchIndexLabel(payload.date ?? safeLabel);
        } else {
          setBatchIndex(null);
          setBatchIndexLabel(null);
        }
      } catch (error) {
        if ((error as { name?: string }).name !== "AbortError") {
          setBatchIndex(null);
          setBatchIndexLabel(null);
        }
      }
    }, 250);

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [label]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const safeQty = clampQty(qty);
    const safeLabel = sanitizeLabel(label) || new Date().toISOString().slice(0, 10);

    setPending(true);
    try {
      const response = await fetch("/api/admin/mint", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          qty: safeQty,
          label: safeLabel,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || response.statusText || "Mint failed");
      }

      const blob = await response.blob();
      const downloadName = makeFilenameFromHeader(
        response.headers.get("Content-Disposition"),
        filenameFallback
      );
      const url = window.URL.createObjectURL(blob);

      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = downloadName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);

      toast({
        title: "Batch minted",
        description: `Generated ${safeQty.toLocaleString()} Linkets (${safeLabel}).`,
        variant: "success",
      });

      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Please try again.";
      toast({
        title: "Mint failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-[28px] border border-border/60 bg-card/80 p-6 shadow-sm">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-muted-foreground">
          Admin minting
        </p>
        <h2 className="text-xl font-semibold text-foreground">Generate Linket codes</h2>
        <p className="text-sm text-muted-foreground">
          Create a new batch of claimable tags and download a CSV for fulfillment.
        </p>
      </div>

      <form className="mt-6 space-y-6" onSubmit={handleSubmit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="admin-mint-qty">Quantity</Label>
            <Input
              id="admin-mint-qty"
              type="number"
              min={MIN_QTY}
              max={MAX_QTY}
              step={50}
              value={qty}
              onChange={(event) => setQty(Number(event.target.value))}
              className="max-w-xs"
              required
            />
            <p className="text-xs text-muted-foreground">
              Between {MIN_QTY} and {MAX_QTY} units per batch.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="admin-mint-label">Batch label</Label>
            <Input
              id="admin-mint-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="2025-10-16"
              className="max-w-xs"
              required
            />
            <p className="text-xs text-muted-foreground">
              Used in reports and the CSV filename.
            </p>
          </div>
        </div>

        <div className="dashboard-mint-surface rounded-2xl border border-border/60 bg-background/60 p-4 text-xs text-muted-foreground">
          <div className="dashboard-mint-title text-sm font-semibold text-foreground">CSV output</div>
          <p className="dashboard-mint-muted mt-1">
            Includes public token, Linket URL, raw claim code, display claim code, claimed status, and batch metadata.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-muted-foreground">
            Filename preview:{" "}
            <span className="font-mono text-foreground">{filenameFallback}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            Batch #{batchIndex ?? "--"}{" "}
            <span className="text-muted-foreground/70">
              {batchIndexLabel ? `for ${batchIndexLabel}` : ""}
            </span>
          </div>
          <Button
            type="submit"
            disabled={pending}
            className="rounded-full px-6"
            aria-busy={pending}
          >
            {pending ? "Minting..." : "Generate CSV"}
          </Button>
        </div>
      </form>
    </section>
  );
}
