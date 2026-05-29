"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Quote } from "lucide-react";

import { cn } from "@/lib/utils";

interface Testimonial {
  id: number;
  quote: string;
  name: string;
  username?: string;
  avatar: string;
}

interface TestimonialSliderProps {
  testimonials: readonly Testimonial[];
  eyebrow?: string;
  title?: string;
  className?: string;
  tone?: "light" | "dark";
}

const getVisibleCount = (width: number) => {
  if (width >= 1280) return 3;
  if (width >= 768) return 2;
  return 1;
};

function TestimonialSlider({
  testimonials,
  eyebrow = "Testimonials",
  title = "What customers say",
  className,
  tone = "dark",
}: TestimonialSliderProps) {
  const isLight = tone === "light";
  const [currentIndex, setCurrentIndex] = useState(0);
  const [windowWidth, setWindowWidth] = useState<number>(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const [direction, setDirection] = useState<1 | -1>(1);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => {
      const newWidth = window.innerWidth;
      const newVisible = getVisibleCount(newWidth);
      setWindowWidth(newWidth);
      const maxIndex = Math.max(0, testimonials.length - newVisible);
      setCurrentIndex((prev) => Math.min(prev, maxIndex));
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [testimonials.length]);

  useEffect(() => {
    if (!isAutoPlaying) return;
    intervalRef.current = setInterval(() => {
      const visible = getVisibleCount(windowWidth);
      const maxIndex = Math.max(0, testimonials.length - visible);
      setCurrentIndex((prev) => {
        if (prev >= maxIndex) {
          setDirection(-1);
          return Math.max(maxIndex - 1, 0);
        }
        if (prev <= 0 && direction === -1) {
          setDirection(1);
          return 1;
        }
        return prev + direction;
      });
    }, 4500);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [direction, isAutoPlaying, testimonials.length, windowWidth]);

  const visible = getVisibleCount(windowWidth);
  const maxIndex = Math.max(0, testimonials.length - visible);
  const canPrev = currentIndex > 0;
  const canNext = currentIndex < maxIndex;

  const goTo = (index: number) => {
    setCurrentIndex(index);
    pauseAutoPlay();
  };

  const goPrev = () => {
    if (!canPrev) return;
    setDirection(-1);
    setCurrentIndex((prev) => Math.max(prev - 1, 0));
    pauseAutoPlay();
  };

  const goNext = () => {
    if (!canNext) return;
    setDirection(1);
    setCurrentIndex((prev) => Math.min(prev + 1, maxIndex));
    pauseAutoPlay();
  };

  const pauseAutoPlay = () => {
    setIsAutoPlaying(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
    setTimeout(() => setIsAutoPlaying(true), 8000);
  };

  return (
    <section
      className={cn(
        "overflow-hidden rounded-[40px] p-6 shadow-[0_35px_80px_rgba(14,34,56,0.25)] backdrop-blur",
        isLight
          ? "border border-[#ffe4d6] bg-gradient-to-br from-[#fffaf5] via-white to-[#ffe9d6] text-slate-900"
          : "bg-white/5 text-white",
        className
      )}
    >
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="text-center"
      >
        <span
          className={cn(
            "inline-block rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.4em]",
            isLight
              ? "bg-[#ff9776]/10 text-[#ff9776]"
              : "bg-white/10 text-white/70"
          )}
        >
          {eyebrow}
        </span>
        <h2
          className={cn(
            "mt-4 text-3xl font-semibold sm:text-4xl",
            isLight ? "text-slate-900" : "text-white"
          )}
        >
          {title}
        </h2>
      </motion.div>

      <div className="relative mt-10">
        <div className="mb-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={goPrev}
            disabled={!canPrev}
            className={cn(
              "rounded-full border p-2 transition",
              isLight
                ? "border-[#ffd3b3] text-[#0f172a]"
                : "border-white/20 text-white",
              canPrev
                ? isLight
                  ? "hover:bg-white"
                  : "hover:bg-white/10"
                : "opacity-40"
            )}
            aria-label="Previous testimonial"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={!canNext}
            className={cn(
              "rounded-full border p-2 transition",
              isLight
                ? "border-[#ffd3b3] text-[#0f172a]"
                : "border-white/20 text-white",
              canNext
                ? isLight
                  ? "hover:bg-white"
                  : "hover:bg-white/10"
                : "opacity-40"
            )}
            aria-label="Next testimonial"
          >
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="overflow-hidden">
          <motion.div
            className="flex"
            animate={{ x: `-${currentIndex * (100 / visible)}%` }}
            transition={{ type: "spring", stiffness: 80, damping: 20 }}
          >
            {testimonials.map((testimonial) => (
              <motion.div
                key={testimonial.id}
                className={cn(
                  "w-full flex-shrink-0 p-3 md:p-4",
                  visible === 3
                    ? "md:w-1/3"
                    : visible === 2
                    ? "md:w-1/2"
                    : "w-full"
                )}
                whileHover={{ y: -6 }}
                transition={{ type: "spring", stiffness: 150, damping: 15 }}
              >
                <div
                  className={cn(
                    "relative h-full rounded-3xl border p-6 text-left shadow-[0_25px_65px_rgba(8,12,32,0.25)] backdrop-blur",
                    isLight
                      ? "border-[#ffe4d6] bg-white text-slate-900"
                      : "border-white/10 bg-white/5 text-white"
                  )}
                >
                  <Quote
                    className={cn(
                      "absolute -top-6 -left-4 h-10 w-10",
                      isLight ? "text-[#ff9776]/20" : "text-white/10"
                    )}
                    aria-hidden
                  />
                  <p
                    className={cn(
                      "text-base leading-relaxed",
                      isLight ? "text-slate-600" : "text-white/80"
                    )}
                  >
                    &ldquo;{testimonial.quote}&rdquo;
                  </p>
                  <div
                    className={cn(
                      "mt-6 flex items-center gap-4 border-t pt-4",
                      isLight ? "border-[#ffe4d6]" : "border-white/10"
                    )}
                  >
                    <div className="relative h-12 w-12 overflow-hidden rounded-full border border-white/20">
                      <Image
                        src={testimonial.avatar}
                        alt={testimonial.name}
                        width={64}
                        height={64}
                        sizes="48px"
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">
                        {testimonial.name}
                      </p>
                      {testimonial.username && (
                        <p
                          className={cn(
                            "text-xs",
                            isLight ? "text-slate-500" : "text-white/60"
                          )}
                        >
                          {testimonial.username}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>

        <div className="mt-6 flex justify-center gap-2">
          {Array.from({ length: maxIndex + 1 }).map((_, index) => (
            <button
              key={index}
              type="button"
              onClick={() => goTo(index)}
              className="flex h-6 w-6 items-center justify-center rounded-full transition"
              aria-label={`Go to testimonial ${index + 1}`}
            >
              <span
                className={cn(
                  "h-2 w-2 rounded-full transition",
                  isLight
                    ? currentIndex === index
                      ? "bg-[#ff9776]"
                      : "bg-[#ffd7c0] hover:bg-[#ffc4a1]"
                    : currentIndex === index
                    ? "bg-white"
                    : "bg-white/30 hover:bg-white/60"
                )}
              />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

export { TestimonialSlider, type Testimonial };
