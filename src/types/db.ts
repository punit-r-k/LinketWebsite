// src/types/db.ts
import type { ThemeName } from "@/lib/themes";

export type UserProfileRecord = {
  id: string;
  user_id: string;
  name: string;
  handle: string;
  headline: string | null;
  avatar_visible: boolean | null;
  header_image_url: string | null;
  header_image_updated_at: string | null;
  header_image_original_file_name: string | null;
  logo_url: string | null;
  logo_updated_at: string | null;
  logo_original_file_name: string | null;
  logo_shape: "circle" | "rect" | null;
  logo_bg_white: boolean | null;
  theme: ThemeName;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ProfileLinkRecord = {
  id: string;
  profile_id: string;
  user_id: string;
  title: string;
  url: string;
  link_type?: "link" | "resume" | null;
  order_index: number;
  is_active: boolean;
  is_override: boolean;
  click_count: number;
  created_at: string;
  updated_at: string | null;
};

export type LeadFlag =
  | "follow_up"
  | "done";

export type Lead = {
  id: string;
  user_id: string;
  handle: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  message: string | null;
  note: string;
  next_follow_up_at: string | null;
  lead_flag: LeadFlag;
  lead_rating: number;
  custom_fields: Record<string, string | boolean | null> | null;
  source_url: string | null;
  created_at: string;
};

export type HardwareTagRecord = {
  id: string;
  chip_uid: string;
  claim_code: string | null;
  status: "unclaimed" | "claimed" | "retired";
  last_claimed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TagAssignmentRecord = {
  id: string;
  tag_id: string;
  user_id: string;
  profile_id: string | null;
  nickname: string | null;
  last_redirected_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TagEventRecord = {
  id: string;
  tag_id: string;
  event_type: string;
  metadata: Record<string, unknown> | null;
  occurred_at: string;
};
