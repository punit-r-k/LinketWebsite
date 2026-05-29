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
      <div className="rounded-[28px] border border-[#ffe4d6] bg-white/80 p-4 shadow-[0_35px_80px_rgba(14,34,56,0.2)] sm:rounded-[40px] sm:p-6">
        <div className="mx-auto h-[240px] w-full max-w-5xl rounded-3xl bg-foreground/5 sm:h-[320px] md:h-[360px]" />
      </div>
    ),
  }
);

export { TestimonialSlider };
