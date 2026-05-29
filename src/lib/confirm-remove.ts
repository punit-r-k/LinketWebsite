export const CONFIRM_REMOVE_EVENT = "linket:confirm-remove";

export type ConfirmRemoveOptions = {
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
};

export type ConfirmRemoveRequest = Required<ConfirmRemoveOptions> & {
  id: string;
  resolve: (confirmed: boolean) => void;
};

function normalizeOptions(
  input: string | ConfirmRemoveOptions = {}
): Required<ConfirmRemoveOptions> {
  if (typeof input === "string") {
    return {
      title: "Remove item?",
      description: input,
      confirmLabel: "Remove",
      cancelLabel: "Cancel",
      variant: "destructive",
    };
  }

  return {
    title: input.title ?? "Remove item?",
    description:
      input.description ??
      "This action cannot be undone once it is confirmed.",
    confirmLabel: input.confirmLabel ?? "Remove",
    cancelLabel: input.cancelLabel ?? "Cancel",
    variant: input.variant ?? "destructive",
  };
}

export function confirmRemove(
  input?: string | ConfirmRemoveOptions
): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);

  return new Promise((resolve) => {
    const request: ConfirmRemoveRequest = {
      ...normalizeOptions(input),
      id: `confirm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      resolve,
    };
    const event = new CustomEvent<ConfirmRemoveRequest>(
      CONFIRM_REMOVE_EVENT,
      {
        detail: request,
        cancelable: true,
      }
    );
    const handled = !window.dispatchEvent(event);
    if (!handled) {
      resolve(false);
    }
  });
}
