"use client"

import * as React from "react"

import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

type SwitchRowProps = Omit<
  React.ComponentProps<typeof Switch>,
  "children"
> & {
  label: React.ReactNode
  description?: React.ReactNode
  labelPosition?: "left" | "right"
  containerClassName?: string
  textClassName?: string
}

function SwitchRow({
  label,
  description,
  labelPosition = "right",
  containerClassName,
  textClassName,
  className,
  ...switchProps
}: SwitchRowProps) {
  const text = (
    <span className={cn("min-w-0 space-y-0.5", textClassName)}>
      <span className="block break-words">{label}</span>
      {description ? (
        <span className="block break-words text-xs text-muted-foreground">
          {description}
        </span>
      ) : null}
    </span>
  )
  const control = <Switch className={cn("shrink-0", className)} {...switchProps} />

  return (
    <label
      className={cn(
        "flex min-w-0 items-center gap-2.5 text-sm font-medium leading-none text-foreground",
        labelPosition === "left" && "justify-between gap-3",
        containerClassName
      )}
    >
      {labelPosition === "left" ? (
        <>
          {text}
          {control}
        </>
      ) : (
        <>
          {control}
          {text}
        </>
      )}
    </label>
  )
}

export { SwitchRow }
