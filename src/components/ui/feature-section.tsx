"use client";

import { useState } from "react";
import Image from "next/image";

import { cn } from "@/lib/utils";

interface Feature {
  step: string;
  title?: string;
  content: string;
  image: string;
}

interface FeatureStepsProps {
  features: readonly Feature[];
  className?: string;
  title?: string;
  imageHeight?: string;
}

export function FeatureSteps({
  features,
  className,
  title = "How it works",
  imageHeight = "h-[400px]",
}: FeatureStepsProps) {
  const [currentFeature, setCurrentFeature] = useState(0);
  const activeFeature = features[currentFeature] ?? features[0];

  if (!activeFeature) {
    return null;
  }

  return (
    <div className={cn("p-4 sm:p-6 md:p-12", className)}>
      <div className="mx-auto w-full max-w-7xl">
        <h2 className="mb-8 text-center text-2xl font-semibold tracking-tight sm:mb-10 sm:text-3xl md:text-4xl lg:text-5xl">
          {title}
        </h2>

        <div className="flex flex-col gap-6 sm:gap-8 md:grid md:grid-cols-[0.9fr_1.1fr] md:gap-10">
          <div className="order-2 md:order-1">
            <div aria-label={`${title} steps`} className="space-y-3 sm:space-y-4">
              {features.map((feature, index) => {
                const isActive = index === currentFeature;

                return (
                  <button
                    key={`${feature.step}-${index}`}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => setCurrentFeature(index)}
                    className={cn(
                      "group flex w-full items-start gap-4 rounded-[20px] border px-4 py-4 text-left transition-[border-color,background-color,box-shadow] duration-200 ease-out sm:gap-5 sm:px-5",
                      isActive
                        ? "border-slate-300 bg-white shadow-[var(--shadow-grounded)]"
                        : "border-transparent bg-transparent hover:border-slate-200 hover:bg-white"
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border text-sm font-semibold transition-[transform,background-color,border-color,color] duration-200 ease-out motion-reduce:transform-none motion-reduce:transition-none",
                        isActive
                          ? "border-[#58c0e0] bg-[#eef8fb] text-[#20586e]"
                          : "border-slate-200 bg-white text-slate-500 group-hover:border-slate-300"
                      )}
                    >
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                        {feature.step}
                      </p>
                      <h3 className="mt-2 text-lg font-semibold text-slate-900 sm:text-xl md:text-2xl">
                        {feature.title || feature.step}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
                        {feature.content}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div
            className={cn(
              "order-1 relative overflow-hidden rounded-[20px] border border-slate-200 bg-[#111317] shadow-[var(--shadow-grounded-lg)] md:order-2",
              "h-[240px] sm:h-[300px] md:h-[360px] lg:h-[420px]",
              imageHeight
            )}
          >
            {features.map((feature, index) => {
              const isActive = index === currentFeature;

              return (
                <div
                  key={`${feature.step}-${feature.image}`}
                  aria-hidden={!isActive}
                  className={cn(
                    "absolute inset-0 overflow-hidden transition-[opacity,transform] duration-300 ease-out motion-reduce:transform-none motion-reduce:transition-none",
                    isActive
                      ? "translate-y-0 opacity-100"
                      : "pointer-events-none translate-y-3 opacity-0"
                  )}
                >
                  <Image
                    src={feature.image}
                    alt={isActive ? feature.title || feature.step : ""}
                    className="h-full w-full object-cover"
                    width={1000}
                    height={500}
                    priority={index === 0}
                    sizes="(min-width: 1024px) 50vw, 100vw"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/15 to-transparent" />
                </div>
              );
            })}
            <div className="absolute inset-x-0 bottom-0 z-10 p-4 sm:p-6">
              <div className="max-w-sm rounded-[16px] border border-white/15 bg-slate-950/90 px-4 py-3 text-white shadow-[0_20px_45px_rgba(2,6,23,0.38)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/55">
                  {activeFeature.step}
                </p>
                <p className="mt-2 text-base font-semibold sm:text-lg">
                  {activeFeature.title || activeFeature.step}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
