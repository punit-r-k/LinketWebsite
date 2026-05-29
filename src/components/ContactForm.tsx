"use client";

import * as React from "react";
import { useForm, useFieldArray, type Path } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { confirmRemove } from "@/lib/confirm-remove";
import type { ContactProfile } from "@/lib/profile.store";

const PhoneSchema = z.object({ value: z.string().min(3), type: z.enum(["work","cell"]), pref: z.boolean().optional() });
const EmailSchema = z.object({ value: z.string().email(), type: z.enum(["work","personal"]), pref: z.boolean().optional() });
const AddressSchema = z.object({
  pobox: z.string().optional().default(""),
  ext: z.string().optional().default(""),
  street: z.string().optional().default(""),
  city: z.string().optional().default(""),
  region: z.string().optional().default(""),
  postcode: z.string().optional().default(""),
  country: z.string().optional().default(""),
});

const Schema = z.object({
  firstName: z.string().optional().default(""),
  lastName: z.string().optional().default(""),
  middleName: z.string().optional().default(""),
  prefix: z.string().optional().default(""),
  suffix: z.string().optional().default(""),
  org: z.string().optional().default(""),
  title: z.string().optional().default(""),
  role: z.string().optional().default(""),
  emails: z.array(EmailSchema).default([]),
  phones: z.array(PhoneSchema).default([]),
  address: AddressSchema.default({ pobox: "", ext: "", street: "", city: "", region: "", postcode: "", country: "" }),
  website: z.string().url().optional().or(z.literal("")),
  note: z.string().optional().default(""),
});

type FormValues = z.infer<typeof Schema>;

export default function ContactForm({ initial, onSave }: { initial: ContactProfile; onSave: (p: ContactProfile) => Promise<void> }) {
  const { register, control, setError, getValues, watch } = useForm<FormValues>({
    defaultValues: {
      firstName: initial.firstName ?? "",
      lastName: initial.lastName ?? "",
      middleName: initial.middleName ?? "",
      prefix: initial.prefix ?? "",
      suffix: initial.suffix ?? "",
      org: initial.org ?? "",
      title: initial.title ?? "",
      role: initial.role ?? "",
      emails: initial.emails ?? [],
      phones: initial.phones ?? [],
      address: initial.address ?? {},
      website: initial.website ?? "",
      note: initial.note ?? "",
    },
  });
  const emails = useFieldArray({ control, name: "emails" });
  const phones = useFieldArray({ control, name: "phones" });

  const [saving, setSaving] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState<number | null>(null);
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = React.useRef(false);
  const [photo, setPhoto] = React.useState<ContactProfile["photo"]>(initial.photo ?? null);

  const buildPayload = React.useCallback(async (values: FormValues): Promise<ContactProfile | null> => {
    const parsed = Schema.safeParse(values);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      if (first) {
        const path = Array.isArray(first.path) ? (first.path.join(".") as string) : (String(first.path) || "root");
        setError(path as unknown as Path<FormValues>, { type: "manual", message: first.message });
      }
      return null;
    }
    const data = parsed.data;
    return {
      handle: initial.handle,
      firstName: data.firstName,
      lastName: data.lastName,
      middleName: data.middleName,
      prefix: data.prefix,
      suffix: data.suffix,
      org: data.org,
      title: data.title,
      role: data.role,
      emails: data.emails,
      phones: data.phones,
      address: data.address,
      website: data.website || undefined,
      note: data.note,
      photo,
    } satisfies ContactProfile;
  }, [initial.handle, setError, photo]);

  React.useEffect(() => {
    const subscription = watch(() => {
      if (!mounted.current) { mounted.current = true; return; }
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        const payload = await buildPayload(getValues());
        if (!payload) return;
        setSaving(true);
        try { await onSave(payload); setSavedAt(Date.now()); } finally { setSaving(false); }
      }, 700);
    });
    return () => { subscription?.unsubscribe?.(); if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [watch, getValues, onSave, photo, buildPayload]);

  async function onPhotoChange(file?: File) {
    if (!file) { setPhoto(null); return; }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    const mime = file.type || "image/jpeg";
    const size = (dataUrl.split(",")[1]?.length || 0) * 0.75;
    if (size <= 150 * 1024) setPhoto({ dataUrl, mime }); else setPhoto({ url: dataUrl, mime });
  }

  return (
    <form className="grid gap-6 md:grid-cols-2" noValidate>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>First name</Label>
            <Input {...register("firstName")} />
          </div>
          <div>
            <Label>Last name</Label>
            <Input {...register("lastName")} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div><Label>Middle</Label><Input {...register("middleName")} /></div>
          <div><Label>Prefix</Label><Input {...register("prefix")} /></div>
          <div><Label>Suffix</Label><Input {...register("suffix")} /></div>
        </div>
        <div><Label>Organization</Label><Input {...register("org")} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Title</Label><Input {...register("title")} /></div>
          <div><Label>Role</Label><Input {...register("role")} /></div>
        </div>
        <div className="space-y-1">
          <Label>Website</Label><Input {...register("website")} placeholder="https://example.com" />
        </div>
        <div className="space-y-1">
          <Label>Photo</Label>
          <Input id="photo" type="file" accept="image/*" onChange={async (e) => onPhotoChange(e.currentTarget.files?.[0] ?? undefined)} />
          <div className="text-xs text-muted-foreground">Changes auto-save.</div>
        </div>
      </div>

      <div className="space-y-4">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Emails</legend>
          {emails.fields.map((f, idx) => (
            <div className="grid grid-cols-[1fr_7rem_5rem_2rem] items-center gap-2" key={f.id}>
              <Input {...register(`emails.${idx}.value` as const)} placeholder="you@work.com" />
              <select className="rounded-md border px-2 py-2" {...register(`emails.${idx}.type` as const)}>
                <option value="work">work</option>
                <option value="personal">personal</option>
              </select>
              <label className="inline-flex items-center gap-1 text-xs"><input type="checkbox" {...register(`emails.${idx}.pref` as const)} /> Pref</label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={async () => {
                  if (
                    !(await confirmRemove({
                      title: "Remove email?",
                      description:
                        "This email will be removed from the saved contact card.",
                      confirmLabel: "Remove email",
                    }))
                  ) {
                    return;
                  }
                  emails.remove(idx);
                }}
              >
                Remove
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" onClick={() => emails.append({ value: "", type: "work" })}>Add email</Button>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Phones</legend>
          {phones.fields.map((f, idx) => (
            <div className="grid grid-cols-[1fr_7rem_5rem_2rem] items-center gap-2" key={f.id}>
              <Input {...register(`phones.${idx}.value` as const)} type="tel" inputMode="tel" placeholder="+15551234567" />
              <select className="rounded-md border px-2 py-2" {...register(`phones.${idx}.type` as const)}>
                <option value="cell">cell</option>
                <option value="work">work</option>
              </select>
              <label className="inline-flex items-center gap-1 text-xs"><input type="checkbox" {...register(`phones.${idx}.pref` as const)} /> Pref</label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={async () => {
                  if (
                    !(await confirmRemove({
                      title: "Remove phone number?",
                      description:
                        "This phone number will be removed from the saved contact card.",
                      confirmLabel: "Remove phone",
                    }))
                  ) {
                    return;
                  }
                  phones.remove(idx);
                }}
              >
                Remove
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" onClick={() => phones.append({ value: "", type: "cell" })}>Add phone</Button>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Work Address</legend>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>PO Box</Label><Input {...register("address.pobox")} /></div>
            <div><Label>Ext</Label><Input {...register("address.ext")} /></div>
          </div>
          <div><Label>Street</Label><Input {...register("address.street")} /></div>
          <div className="grid grid-cols-3 gap-2">
            <div><Label>City</Label><Input {...register("address.city")} /></div>
            <div><Label>Region</Label><Input {...register("address.region")} /></div>
            <div><Label>Postcode</Label><Input {...register("address.postcode")} /></div>
          </div>
          <div><Label>Country</Label><Input {...register("address.country")} /></div>
        </fieldset>

        <div className="space-y-1">
          <Label>Note</Label>
          <Input {...register("note")} placeholder="Short note" />
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{saving ? "Saving..." : savedAt ? "Saved" : ""}</span>
        </div>
      </div>
    </form>
  );
}
