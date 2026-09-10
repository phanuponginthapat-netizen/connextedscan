import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CMS_GROUPS, CMS_DEFAULTS, type CmsMap } from "@/lib/cms";
import { cmsQueryOptions, useCms } from "@/lib/cms-client";

export const Route = createFileRoute("/admin/cms")({
  head: () => ({
    meta: [
      { title: "จัดการเนื้อหาระบบ | FaceGate" },
      { name: "description", content: "แก้ไขชื่อระบบ โลโก้ สี และข้อความทุกจุดของระบบสแกนใบหน้า" },
      { property: "og:title", content: "จัดการเนื้อหาระบบ | FaceGate" },
      { property: "og:description", content: "ปรับแต่งแบรนด์ สี และข้อความทั้งระบบได้จากหลังบ้าน" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CmsPage,
});

function CmsPage() {
  const { map } = useCms();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<CmsMap>({});
  const [activeGroup, setActiveGroup] = useState(CMS_GROUPS[0]!.id);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft((prev) => ({ ...map, ...prev }));
  }, [map]);

  const valueOf = (key: string) => draft[key] ?? map[key] ?? CMS_DEFAULTS[key] ?? "";
  const setValue = (key: string, value: string) => setDraft((d) => ({ ...d, [key]: value }));

  const group = CMS_GROUPS.find((g) => g.id === activeGroup) ?? CMS_GROUPS[0]!;

  const save = async () => {
    setSaving(true);
    const rows = group.fields.map((f) => ({
      key: f.key,
      value: valueOf(f.key),
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from("site_content").upsert(rows, { onConflict: "key" });
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
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">จัดการเนื้อหาระบบ</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          แก้ชื่อระบบ โลโก้ สี และข้อความทุกจุดได้จากที่นี่ โดยไม่ต้องแก้โปรแกรม
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {CMS_GROUPS.map((g) => (
          <Button
            key={g.id}
            size="sm"
            variant={g.id === activeGroup ? "default" : "secondary"}
            onClick={() => setActiveGroup(g.id)}
          >
            {g.title}
          </Button>
        ))}
      </div>

      <section className="panel-card p-6">
        <h2 className="text-lg font-semibold">{group.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{group.description}</p>

        <div className="mt-6 grid gap-5 md:grid-cols-2">
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
      </section>
    </div>
  );
}
