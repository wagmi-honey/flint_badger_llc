import nodemailer from 'nodemailer';

// Emails each new inquiry to the business. Without SMTP settings it only logs.
export function createMailer({ smtp, mailFrom, notifyEmail }) {
  const transport = smtp ? nodemailer.createTransport(smtp) : null;

  return {
    enabled: Boolean(transport),
    async notify(record) {
      if (!transport) return;
      const lines = [
        `Name: ${record.name}`,
        `Email: ${record.email}`,
        `Phone: ${record.phone ?? 'not given'}`,
        `Service: ${record.service || 'not selected'}`,
        `Text messages: ${record.sms.consent ? 'OPTED IN' : 'not opted in'}`,
        `Received: ${record.receivedAt}`,
        '',
        record.details,
      ];
      await transport.sendMail({
        from: mailFrom,
        to: notifyEmail,
        replyTo: record.email,
        subject: `New inquiry from ${record.name}`,
        text: lines.join('\n'),
      });
    },
  };
}
