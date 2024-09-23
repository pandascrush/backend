// config/email.config.mjs
import nodemailer from "nodemailer";

// Configure the email transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "sivaranji5670@gmail.com",
    pass: "jlja febg xbfg bhyi",
  },
});

export default transporter;
