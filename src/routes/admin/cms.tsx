import { createFileRoute, redirect } from "@tanstack/react-router";

/** จัดการเนื้อหาถูกรวมเข้ากับหน้าตั้งค่าระบบแล้ว */
export const Route = createFileRoute("/admin/cms")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/settings" });
  },
  component: () => null,
});
