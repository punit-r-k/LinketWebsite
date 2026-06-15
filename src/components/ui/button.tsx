import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "appearance-none inline-flex items-center justify-center whitespace-nowrap rounded-md border text-sm font-medium transition-[background-color,color,border-color,box-shadow,transform] focus-visible:outline-none focus-visible:[box-shadow:0_0_0_2px_var(--color-button-focus-offset),0_0_0_5px_var(--color-button-focus-ring)] disabled:pointer-events-none disabled:opacity-100 disabled:[background:var(--color-button-disabled-bg)] disabled:[color:var(--color-button-disabled-fg)] disabled:[border-color:var(--color-button-disabled-border)] disabled:shadow-none",
  {
    variants: {
      variant: {
        default:
          "[background:var(--color-button-primary-bg)] [color:var(--color-button-primary-fg)] border-[color:var(--color-button-primary-border)] shadow-[0_14px_30px_-24px_rgba(15,23,42,0.45)] hover:[background:var(--color-button-primary-bg-hover)] active:[background:var(--color-button-primary-bg-active)] active:scale-[0.98]",
        landingPrimary:
          "button-landing-primary active:scale-[0.985]",
        landingSecondary:
          "button-landing-secondary active:scale-[0.985]",
        destructive:
          "[background:var(--color-button-destructive-bg)] [color:var(--color-button-destructive-fg)] border-[color:var(--color-button-destructive-border)] shadow-[0_14px_30px_-24px_var(--color-button-destructive-shadow)] hover:[background:var(--color-button-destructive-bg-hover)] active:[background:var(--color-button-destructive-bg-active)] active:scale-[0.98]",
        success:
          "[background:var(--color-button-success-bg)] [color:var(--color-button-success-fg)] border-[color:var(--color-button-success-border)] shadow-[0_14px_30px_-24px_var(--color-button-success-shadow)] hover:[background:var(--color-button-success-bg-hover)] active:[background:var(--color-button-success-bg-active)] active:scale-[0.98]",
        outline:
          "[background:var(--color-button-outline-bg)] [color:var(--color-button-outline-fg)] border-[color:var(--color-button-outline-border)] shadow-[0_10px_24px_-24px_rgba(15,23,42,0.32)] hover:[background:var(--color-button-outline-bg-hover)] hover:[color:var(--color-button-outline-fg-hover)] active:[background:var(--color-button-outline-bg-active)]",
        secondary:
          "[background:var(--color-button-secondary-bg)] [color:var(--color-button-secondary-fg)] border-[color:var(--color-button-secondary-border)] shadow-[0_10px_24px_-22px_rgba(15,23,42,0.34)] hover:[background:var(--color-button-secondary-bg-hover)] hover:[color:var(--color-button-secondary-fg-hover)] active:[background:var(--color-button-secondary-bg-active)] active:scale-[0.98]",
        ghost:
          "[background:var(--color-button-ghost-bg)] [color:var(--color-button-ghost-fg)] border-[color:var(--color-button-ghost-border)] shadow-[0_8px_20px_-24px_rgba(15,23,42,0.28)] hover:[background:var(--color-button-ghost-bg-hover)] hover:[color:var(--color-button-ghost-fg-hover)] active:[background:var(--color-button-ghost-bg-active)]",
        custom:
          "border-transparent bg-transparent text-current shadow-none",
        link: "border-transparent bg-transparent p-0 [color:var(--color-button-link-fg)] shadow-none underline decoration-[color:var(--color-button-link-underline)] underline-offset-4 hover:[color:var(--color-button-link-fg-hover)] hover:decoration-[color:var(--color-button-link-fg-hover)]",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        data-slot="button"
        data-variant={variant ?? "default"}
        data-size={size ?? "default"}
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };
