import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, RotateCcw, Save, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CMS_DEFAULTS, type CmsGroup, type CmsMap } from "@/lib/cms";
import { cmsQueryOptions, useCms } from "@/lib/cms-client";

/** Shrink an uploaded logo and keep it inline so every screen can show it. */
async function uploadLogo(file: File, apply: (value: string) => void) {
  try {
    const bitmap = await createImageBitmap(file);
    const max = 320;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    apply(canvas.toDataURL("image/png"));
    toast.success("อัปโหลดโลโก้แล้ว กด “บันทึก” เพื่อยืนยัน");
  } catch {
    toast.error("อ่านไฟล์รูปไม่สำเร็จ");
  }
}

export function CmsSection({ group }: { group: CmsGroup }) {
  const { map } = useCms();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<CmsMap>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft((prev) => ({ ...map, ...prev }));
  }, [map]);

  const valueOf = (key: string) => draft[key] ?? map[key] ?? CMS_DEFAULTS[key] ?? "";
  const setValue = (key: string, value: string) => setDraft((d) => ({ ...d, [key]: value }));

  const save = async () => {
    setSaving(true);
    const rows = group.fields.map((f) => ({
      key: f.key,
      value: valueOf(f.key),
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from("site_content").upsert(rows, { onConflict: "key" });
    // Keep the single source of truth: mirror the school name into settings too.
    if (!error && group.fields.some((f) => f.key === "brand.school_name")) {
      await supabase
        .from("settings")
        .update({ school_name: valueOf("brand.school_name"), updated_at: new Date().toISOString() })
        .eq("id", true);
    }
    setSaving(false);
    if (error) {
      toast.error("บันทึกไม่สำเร็จ: " + error.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: cmsQueryOptions.queryKey });
    toast.success("บันทึกเนื้อหาเรียบร้อย");
  };

  const resetGroup = () => {
    setDraft((d) => {
      const next = { ...d };
      for (const f of group.fields) next[f.key] = f.default;
      return next;
    });
    toast.message("คืนค่าเริ่มต้นแล้ว กด “บันทึก” เพื่อยืนยัน");
  };

  return (
    <div>
      <div className="grid gap-5 md:grid-cols-2">
        {group.fields.map((field) => (
          <div key={field.key} className="space-y-2">
            <Label htmlFor={field.key}>{field.label}</Label>
            {field.type === "textarea" ? (
              <Textarea
                id={field.key}
                rows={3}
                value={valueOf(field.key)}
                onChange={(e) => setValue(field.key, e.target.value)}
              />
            ) : field.type === "color" ? (
              <div className="flex items-center gap-2">
                <input
                  id={field.key}
                  type="color"
                  className="size-10 cursor-pointer rounded-md border bg-card"
                  value={/^#[0-9a-fA-F]{6}$/.test(valueOf(field.key)) ? valueOf(field.key) : "#0b3b7a"}
                  onChange={(e) => setValue(field.key, e.target.value)}
                />
                <Input
                  value={valueOf(field.key)}
                  onChange={(e) => setValue(field.key, e.target.value)}
                />
              </div>
            ) : field.key === "brand.logo_url" ? (
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  {valueOf(field.key) ? (
                    <img
                      src={valueOf(field.key)}
                      alt="โลโก้ระบบ"
                      className="size-14 rounded-lg border bg-card object-contain p-1"
                    />
                  ) : (
                    <div className="flex size-14 items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">
                      ไม่มี
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="secondary">
                      <label className="cursor-pointer">
                        <Upload className="size-4" /> อัปโหลดรูปโลโก้
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = "";
                            if (file) void uploadLogo(file, (v) => setValue(field.key, v));
                          }}
                        />
                      </label>
                    </Button>
                    {valueOf(field.key) && (
                      <Button size="sm" variant="ghost" onClick={() => setValue(field.key, "")}>
                        ลบโลโก้
                      </Button>
                    )}
                  </div>
                </div>
                <Input
                  id={field.key}
                  value={valueOf(field.key).startsWith("data:") ? "" : valueOf(field.key)}
                  onChange={(e) => setValue(field.key, e.target.value)}
                  placeholder="หรือวางลิงก์รูปโลโก้"
                />
                <p className="text-xs text-muted-foreground">
                  อัปโหลดรูป PNG/JPG ระบบจะย่อขนาดให้อัตโนมัติ
                </p>
              </div>
            ) : (
              <Input
                id={field.key}
                value={valueOf(field.key)}
                onChange={(e) => setValue(field.key, e.target.value)}
                placeholder={field.default}
              />
            )}
            {field.help ? <p className="text-xs text-muted-foreground">{field.help}</p> : null}
          </div>
        ))}
      </div>

      <div className="mt-7 flex flex-wrap gap-2 border-t pt-5">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          บันทึก
        </Button>
        <Button variant="secondary" onClick={resetGroup}>
          <RotateCcw className="size-4" /> คืนค่าเริ่มต้น
        </Button>
      </div>
    </div>
  );
}
