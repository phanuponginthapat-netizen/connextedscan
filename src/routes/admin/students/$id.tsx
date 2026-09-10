import { createFileRoute } from "@tanstack/react-router";
import { PersonDetail } from "@/components/people/PersonDetail";

export const Route = createFileRoute("/admin/students/$id")({
  head: () => ({
    meta: [
      { title: "ลงทะเบียนใบหน้านักเรียน | FaceGate" },
      { name: "description", content: "ลงทะเบียนใบหน้านักเรียนด้วยการถ่ายสดหลายมุมหรืออัปโหลดรูป" },
      { property: "og:title", content: "ลงทะเบียนใบหน้านักเรียน | FaceGate" },
      { property: "og:description", content: "ลงทะเบียนใบหน้านักเรียนหลายมุมสำหรับตู้สแกน" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StudentDetailRoute,
});

function StudentDetailRoute() {
  const { id } = Route.useParams();
  return <PersonDetail id={id} personType="student" />;
}
