import { createFileRoute } from "@tanstack/react-router";
import { PeopleList } from "@/components/people/PeopleList";

export const Route = createFileRoute("/admin/students/")({
  head: () => ({
    meta: [
      { title: "รายชื่อนักเรียน | FaceGate" },
      { name: "description", content: "จัดการรายชื่อนักเรียนและสถานะการลงทะเบียนใบหน้า" },
      { property: "og:title", content: "รายชื่อนักเรียน | FaceGate" },
      { property: "og:description", content: "จัดการรายชื่อนักเรียนและการลงทะเบียนใบหน้า" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <PeopleList personType="student" />,
});
