import nodemailer from "nodemailer";
import { SENDER_EMAIL, getConfig } from "../config/index.mjs";

let transporter = null;

function getTransporter() {
  if (!transporter) {
    const config = getConfig();
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: SENDER_EMAIL,
        pass: config.emailAppPass,
      },
    });
  }
  return transporter;
}

/**
 * Send an email from the shared sender address.
 * @param {{to: string, subject: string, html: string}} message
 */
export async function sendEmail({ to, subject, html }) {
  const info = await getTransporter().sendMail({
    from: SENDER_EMAIL,
    to,
    subject,
    html,
  });
  console.log(`Email sent: ${subject}`);
  return info;
}
