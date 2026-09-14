# Roadmap

## Done
- [x] Retention cleanup engine (`src/lib/cleanup.server.ts`) + cron endpoint `/api/public/cron/cleanup` + manual button
- [x] Notification engine (`src/lib/notify.server.ts`): absent, late, early leave, failed streak, offline device
- [x] Cron endpoint `/api/public/cron/notify` + manual "check now" and "send test"
- [x] Notification recipients + channel/event settings page `/admin/notifications`
- [x] System health page `/admin/health` (device online, agent version, platform, last scan, background jobs)
- [x] Agent reports `agent_version` + `platform` on sync (AGENT_VERSION 1.3.0)
- [x] Bulk import people from Excel/CSV (`ImportPeopleDialog`)
- [x] Attendance time rules extracted to `src/lib/attendance-rules.ts` with 12 vitest tests
- [x] Extra database indexes (migration 0015)

## Open (blocked)
- [ ] Email delivery: needs a verified sender domain for the project. `src/lib/email/send.server.ts` is the single place to complete once the domain exists.
- [ ] LINE delivery: needs `LINE_CHANNEL_ACCESS_TOKEN` secret from the school's LINE Official Account.
- [ ] Automatic hourly schedule for cleanup/notify cron endpoints: needs the cron secret to be wired into a scheduled job. Manual buttons work today.
