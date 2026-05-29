"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CONFIRM_REMOVE_EVENT,
  type ConfirmRemoveRequest,
} from "@/lib/confirm-remove";

export default function ConfirmDialogHost() {
  const [request, setRequest] = useState<ConfirmRemoveRequest | null>(null);
  const resolvedRef = useRef<string | null>(null);

  useEffect(() => {
    function onConfirm(event: Event) {
      const customEvent = event as CustomEvent<ConfirmRemoveRequest>;
      if (!customEvent.detail?.resolve) return;
      event.preventDefault();
      resolvedRef.current = null;
      setRequest(customEvent.detail);
    }

    window.addEventListener(CONFIRM_REMOVE_EVENT, onConfirm as EventListener);
    return () => {
      window.removeEventListener(
        CONFIRM_REMOVE_EVENT,
        onConfirm as EventListener
      );
    };
  }, []);

  function resolveCurrent(confirmed: boolean) {
    if (!request) return;
    if (resolvedRef.current === request.id) return;
    resolvedRef.current = request.id;
    request.resolve(confirmed);
    setRequest(null);
  }

  return (
    <Dialog
      open={Boolean(request)}
      onOpenChange={(open) => {
        if (!open) resolveCurrent(false);
      }}
    >
      <DialogContent className="rounded-2xl border-border/70 bg-card/95 shadow-[0_28px_70px_-38px_rgba(15,23,42,0.45)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{request?.title ?? "Confirm action"}</DialogTitle>
          <DialogDescription>
            {request?.description ??
              "Please confirm before continuing with this action."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => resolveCurrent(false)}
          >
            {request?.cancelLabel ?? "Cancel"}
          </Button>
          <Button
            type="button"
            variant={
              request?.variant === "destructive" ? "destructive" : "default"
            }
            onClick={() => resolveCurrent(true)}
          >
            {request?.confirmLabel ?? "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
