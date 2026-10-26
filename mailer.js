const nodemailer = require('nodemailer');

function smtpConfig(prefix) {
    if (!process.env[`${prefix}_HOST`] || !process.env[`${prefix}_USER`] || !process.env[`${prefix}_PASSWORD`]) return null;
    return {
        host: process.env[`${prefix}_HOST`],
        port: Number(process.env[`${prefix}_PORT`] || 587),
        secure: process.env[`${prefix}_SECURE`] === 'true',
        auth: {
            user: process.env[`${prefix}_USER`],
            pass: process.env[`${prefix}_PASSWORD`]
        },
        from: process.env[`${prefix}_FROM`] || process.env[`${prefix}_USER`]
    };
}

function createMailer() {
    const transports = ['SMTP_PRIMARY', 'SMTP_BACKUP']
        .map(smtpConfig)
        .filter(Boolean);
    if (!transports.length) throw new Error('No SMTP provider is configured.');

    return {
        async sendResetEmail(to, resetUrl) {
            let lastError;
            for (const config of transports) {
                try {
                    const transporter = nodemailer.createTransport(config);
                    await transporter.sendMail({
                        from: config.from,
                        to,
                        subject: 'Reset your Click-a-Streak password',
                        text: `Reset your password using this link (expires in 30 minutes): ${resetUrl}`,
                        html: `<p>Reset your Click-a-Streak password:</p><p><a href="${resetUrl}">Reset password</a></p><p>This link expires in 30 minutes.</p>`
                    });
                    return;
                } catch (error) {
                    lastError = error;
                }
            }
            throw lastError;
        }
    };
}

module.exports = { createMailer };
