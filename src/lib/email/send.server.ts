/**
 * Email sender for system notifications.
 *
 * Email delivery needs a verified sender domain for this project. Until one is
 * configured this helper reports the reason so the notification history shows
 * exactly why an email was not delivered. Once a sender domain is verified,
 * replace the body with the real send call.
 */
export async function sendMail(_args: {
  to: string;
  subject: string;
  text: string;
}): Promise<void> {
  throw new Error("ยังไม่ได้ตั้งค่าโดเมนอีเมลของระบบ จึงยังส่งอีเมลไม่ได้");
}
