import { createFileRoute } from "@tanstack/react-router";
import { PeopleList } from "@/components/people/PeopleList";

export const Route = createFileRoute("/admin/staff/")({
  head: () => ({
    meta: [
      { title: "รายชื่อบุคลากร | FaceGate" },
      { name: "description", content: "จัดการรายชื่อบุคลากร ฝ่าย/แผนก และการลงทะเบียนใบหน้า" },
      { property: "og:title", content: "รายชื่อบุคลากร | FaceGate" },
      { property: "og:description", content: "จัดการรายชื่อบุคลากรและการลงทะเบียนใบหน้า" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <PeopleList personType="staff" />,
});
