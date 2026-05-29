"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { toast } from "@/components/system/toaster";
import { Button } from "@/components/ui/button";
import { confirmRemove } from "@/lib/confirm-remove";
import { CSRF_HEADER_NAME, getBrowserCsrfToken } from "@/lib/csrf";

type RemovePaymentMethodButtonProps = {
  paymentMethodId: string;
  isDefault: boolean;
};

export default function RemovePaymentMethodButton({
  paymentMethodId,
  isDefault,
}: RemovePaymentMethodButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleClick() {
    if (pending) return;

    const confirmed = await confirmRemove({
      title: isDefault ? "Remove default card?" : "Remove saved card?",
      description: isDefault
        ? "Future renewals will use another saved card if one is available."
        : "This payment method will be removed from your billing profile.",
      confirmLabel: "Remove card",
    });
    if (!confirmed) return;

    setPending(true);

    try {
      const csrfToken = getBrowserCsrfToken();
      const response = await fetch("/api/billing/payment-method/remove", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { [CSRF_HEADER_NAME]: csrfToken } : {}),
        },
        body: JSON.stringify({ paymentMethodId }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to remove card.");
      }

      toast({
        title: "Card removed",
        description: "The payment method was removed from your billing profile.",
        variant: "success",
      });
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to remove card.";
      toast({
        title: "Remove failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="!rounded-full !border !border-red-300 !bg-none !bg-red-50 !text-red-700 hover:!bg-red-100 hover:!text-red-800"
      onClick={handleClick}
      disabled={pending}
    >
      {pending ? "Removing..." : "Remove card"}
    </Button>
  );
}
