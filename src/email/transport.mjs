import nodemailer from "nodemailer";
import { SENDER_EMAIL, getConfig } from "../config/index.mjs";

let transporter = null;

export function getTransporter() {
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
