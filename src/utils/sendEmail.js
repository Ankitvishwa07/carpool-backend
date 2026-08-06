const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// async function sendEmail({ to, subject, html }) {
//   await transporter.sendMail({
//     from: process.env.EMAIL_FROM,
//     to,
//     subject,
//     html,
//   });
// }

async function sendEmail({ to, subject, html }) {
  console.log('--- EMAIL (dev mode, not actually sent) ---');
  console.log('To:', to);
  console.log('Subject:', subject);
  console.log(html);
  console.log('--------------------------------------------');
}

module.exports = sendEmail;
