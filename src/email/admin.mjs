import nodemailer from "nodemailer";
import { SENDER_EMAIL, ADMIN_EMAIL, getConfig } from "../config/index.mjs";

/**
 * Send admin notification email
 * @param {string} subject
 * @param {string} html
 */
export async function sendAdminNotification(subject, html) {
  try {
    const config = getConfig();
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: SENDER_EMAIL,
        pass: config.emailAppPass,
      },
    });

    await transporter.sendMail({
      from: SENDER_EMAIL,
      to: ADMIN_EMAIL,
      subject,
      html,
    });
    console.log(`Admin notification sent: ${subject}`);
  } catch (error) {
    console.error("Failed to send admin notification:", error);
  }
}
