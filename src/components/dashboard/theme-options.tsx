import Image from "next/image";
import {
  Cloud,
  Hexagon,
  Leaf,
  Moon,
  MoonStar,
  Rose,
  Star,
  Sun,
  Trees,
} from "lucide-react";
import type { ComponentType } from "react";

import type { ThemeName } from "@/lib/themes";
import { cn } from "@/lib/utils";

const HookemLonghornIcon = ({ className }: { className?: string }) => (
  <Image
    src="/logos/hookem-theme-icon.svg"
    alt=""
    width={24}
    height={24}
    aria-hidden="true"
    className={cn("object-contain", className)}
  />
);

const AggieWolfIcon = ({ className }: { className?: string }) => (
  <span
    aria-hidden="true"
    className={cn("block bg-[#500000]", className)}
    style={{
      WebkitMaskImage: "url('/logos/aggie-theme-icon.png')",
      maskImage: "url('/logos/aggie-theme-icon.png')",
      WebkitMaskRepeat: "no-repeat",
      maskRepeat: "no-repeat",
      WebkitMaskPosition: "center",
      maskPosition: "center",
      WebkitMaskSize: "contain",
      maskSize: "contain",
    }}
  />
);

export type DashboardThemeOption = {
  value: ThemeName;
  label: string;
  description: string;
  swatchClassName: string;
  preview: string;
  textTone: "light" | "dark";
  icon: ComponentType<{ className?: string }>;
};

export const DASHBOARD_THEME_OPTIONS: DashboardThemeOption[] = [
  {
    value: "light",
    label: "Light",
    description: "Clean, bright, and minimal",
    swatchClassName:
      "bg-[linear-gradient(135deg,#f8fafc_0%,#ffffff_45%,#dbeafe_100%)]",
    preview: "linear-gradient(135deg, #f8fafc 0%, #ffffff 45%, #dbeafe 100%)",
    textTone: "dark",
    icon: Sun,
  },
  {
    value: "dark",
    label: "Dark",
    description: "Simple, polished, and high contrast",
    swatchClassName:
      "bg-[linear-gradient(135deg,#0f172a_0%,#1e293b_45%,#475569_100%)]",
    preview: "linear-gradient(135deg, #0f172a 0%, #1e293b 45%, #475569 100%)",
    textTone: "light",
    icon: Moon,
  },
  {
    value: "midnight",
    label: "Midnight",
    description: "Bold, sleek, high contrast",
    swatchClassName:
      "bg-[linear-gradient(135deg,#0f172a_0%,#1e293b_45%,#4f46e5_100%)]",
    preview: "linear-gradient(135deg, #0f172a 0%, #1e293b 45%, #4f46e5 100%)",
    textTone: "light",
    icon: MoonStar,
  },
  {
    value: "dream",
    label: "Dream",
    description: "Soft, modern, polished",
    swatchClassName:
      "bg-[linear-gradient(135deg,#f8f4ff_0%,#cdb7ff_45%,#7dd3fc_100%)]",
    preview: "linear-gradient(135deg, #f8f4ff 0%, #cdb7ff 45%, #7dd3fc 100%)",
    textTone: "dark",
    icon: Cloud,
  },
  {
    value: "forest",
    label: "Forest",
    description: "Confident, grounded, rich",
    swatchClassName:
      "bg-[linear-gradient(135deg,#0f3d2f_0%,#1f7a53_52%,#9ad7b9_100%)]",
    preview: "linear-gradient(135deg, #0f3d2f 0%, #1f7a53 52%, #9ad7b9 100%)",
    textTone: "light",
    icon: Trees,
  },
  {
    value: "gilded",
    label: "Gilded",
    description: "Luxurious, refined, dramatic",
    swatchClassName:
      "bg-[linear-gradient(135deg,#050505_0%,#4a3515_50%,#f5d76e_100%)]",
    preview: "linear-gradient(135deg, #050505 0%, #4a3515 50%, #f5d76e 100%)",
    textTone: "light",
    icon: Star,
  },
  {
    value: "rose",
    label: "Rose",
    description: "Editorial, expressive, clean",
    swatchClassName:
      "bg-[linear-gradient(135deg,#fff1f2_0%,#fda4af_42%,#fb7185_100%)]",
    preview: "linear-gradient(135deg, #fff1f2 0%, #fda4af 42%, #fb7185 100%)",
    textTone: "dark",
    icon: Rose,
  },
  {
    value: "autumn",
    label: "Autumn",
    description: "Warm, premium, approachable",
    swatchClassName:
      "bg-[linear-gradient(135deg,#fff1e6_0%,#ffb37a_48%,#ff7b6b_100%)]",
    preview: "linear-gradient(135deg, #fff1e6 0%, #ffb37a 48%, #ff7b6b 100%)",
    textTone: "dark",
    icon: Leaf,
  },
  {
    value: "honey",
    label: "Honey",
    description: "Bright, upbeat, friendly",
    swatchClassName:
      "bg-[linear-gradient(135deg,#fff7cc_0%,#ffd166_42%,#ff9f1c_100%)]",
    preview: "linear-gradient(135deg, #fff7cc 0%, #ffd166 42%, #ff9f1c 100%)",
    textTone: "dark",
    icon: Hexagon,
  },
  {
    value: "burnt-orange",
    label: "Hook 'Em",
    description: "Bold, spirited, burnt orange",
    swatchClassName:
      "bg-[linear-gradient(135deg,#fff2e6_0%,#bf5700_50%,#7c2d12_100%)]",
    preview: "linear-gradient(135deg, #fff2e6 0%, #bf5700 50%, #7c2d12 100%)",
    textTone: "light",
    icon: HookemLonghornIcon,
  },
  {
    value: "maroon",
    label: "Aggie",
    description: "Deep, classic, maroon",
    swatchClassName:
      "bg-[linear-gradient(135deg,#fff0f2_0%,#500000_48%,#2a0000_100%)]",
    preview: "linear-gradient(135deg, #fff0f2 0%, #500000 48%, #2a0000 100%)",
    textTone: "light",
    icon: AggieWolfIcon,
  },
];

export const DASHBOARD_THEME_ORDER = DASHBOARD_THEME_OPTIONS.map(
  (option) => option.value
);

export const DASHBOARD_THEME_LABELS = Object.fromEntries(
  DASHBOARD_THEME_OPTIONS.map((option) => [option.value, option.label])
) as Record<ThemeName, string>;

export const DASHBOARD_THEME_ICONS = Object.fromEntries(
  DASHBOARD_THEME_OPTIONS.map((option) => [option.value, option.icon])
) as Record<ThemeName, ComponentType<{ className?: string }>>;
