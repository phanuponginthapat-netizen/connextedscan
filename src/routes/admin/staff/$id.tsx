import { createFileRoute } from "@tanstack/react-router";
import { PersonDetail } from "@/components/people/PersonDetail";

export const Route = createFileRoute("/admin/staff/$id")({
  head: () => ({
    meta: [
      { title: "ลงทะเบียนใบหน้าบุคลากร | FaceGate" },
      { name: "description", content: "ลงทะเบียนใบหน้าบุคลากรด้วยการถ่ายสดหลายมุมหรืออัปโหลดรูป" },
      { property: "og:title", content: "ลงทะเบียนใบหน้าบุคลากร | FaceGate" },
      { property: "og:description", content: "ลงทะเบียนใบหน้าบุคลากรหลายมุมสำหรับตู้สแกน" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StaffDetailRoute,
});

function StaffDetailRoute() {
  const { id } = Route.useParams();
  return <PersonDetail id={id} personType="staff" />;
}
