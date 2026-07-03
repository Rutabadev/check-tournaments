import { ADMIN_EMAIL } from "../config/index.mjs";
import { sendEmail } from "./transport.mjs";

/**
 * Send admin notification email
 * @param {string} subject
 * @param {string} html
 */
export async function sendAdminNotification(subject, html) {
  try {
    await sendEmail({ to: ADMIN_EMAIL, subject, html });
  } catch (error) {
    console.error("Failed to send admin notification:", error);
  }
}
