"use client";

import dynamic from "next/dynamic";

export { FeatureSteps } from "@/components/ui/feature-section";

const TestimonialSlider = dynamic(
  () =>
    import("@/components/ui/testimonial-slider").then(
      (mod) => mod.TestimonialSlider
    ),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-[var(--shadow-grounded)] sm:p-6">
        <div className="mx-auto h-[240px] w-full max-w-5xl rounded-[16px] bg-foreground/5 sm:h-[320px] md:h-[360px]" />
      </div>
    ),
  }
);

export { TestimonialSlider };
