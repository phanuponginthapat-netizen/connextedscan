import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CMS_DEFAULTS, cmsValue, type CmsMap } from "@/lib/cms";

export const cmsQueryOptions = {
  queryKey: ["site-content"],
  staleTime: 60_000,
  queryFn: async (): Promise<CmsMap> => {
    const { data, error } = await supabase.from("site_content").select("key, value");
    if (error) return {};
    const map: CmsMap = {};
    for (const row of data ?? []) map[row.key] = row.value ?? "";
    return map;
  },
};

export function useCms() {
  const { data } = useQuery(cmsQueryOptions);
  const t = (key: string) => cmsValue(data, key);
  return { t, map: data ?? {}, defaults: CMS_DEFAULTS };
}

/** Applies brand colours from the CMS onto the live theme tokens. */
export function BrandTheme() {
  const { t } = useCms();
  const primary = t("brand.primary_color");
  const accent = t("brand.accent_color");
  const surface = t("brand.surface_color");

  useEffect(() => {
    const root = document.documentElement;
    const set = (name: string, value: string) => {
      if (/^#[0-9a-fA-F]{3,8}$/.test(value)) root.style.setProperty(name, value);
    };
    set("--primary", primary);
    set("--sidebar", primary);
    set("--sidebar-primary", accent);
    set("--ring", accent);
    set("--background", surface);
  }, [primary, accent, surface]);

  return null;
}
