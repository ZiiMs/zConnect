/**
 * Outbound email is a port, not a library call.
 *
 * Callers (invitations, notifications, the digest job) depend on `Mailer` and
 * never on nodemailer, so tests and ops can swap in the memory adapter or run
 * with mail disabled (`null`) without touching their own code. Plain text is
 * the source of truth for every message; HTML is an optional nicer rendering
 * supplied by the caller that owns the content.
 */

import { createTransport } from "nodemailer"

export interface MailMessage {
  to: string
  subject: string
  text: string
  html?: string
}

export interface Mailer {
  send(message: MailMessage): Promise<void>
}

/** Memory adapter for tests/ops: records every message. */
export function createMemoryMailer(): Mailer & {
  sent: MailMessage[]
  reset(): void
} {
  const sent: MailMessage[] = []

  return {
    sent,
    async send(message) {
      sent.push({ ...message })
    },
    reset() {
      sent.length = 0
    },
  }
}

/**
 * SMTP adapter. nodemailer connects lazily on the first `sendMail`, so
 * constructing one never opens a socket; there is deliberately no pool.
 * Accepts both `smtp://` (STARTTLS when offered) and `smtps://` (implicit TLS).
 */
export function createSmtpMailer(config: {
  url: string
  from: string
}): Mailer {
  const transport = createTransport(config.url)

  return {
    async send(message) {
      await transport.sendMail({
        from: config.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      })
    },
  }
}

const DEFAULT_FROM = "zConnect <no-reply@localhost>"

/**
 * Mail configured by the environment, or `null` when `SMTP_URL` is unset or
 * empty (the invitation route then falls back to a copy-link response).
 *
 * The environment is read on every call rather than at module load, so
 * importing this module is safe with no env and changing it in a test or at
 * boot works as expected.
 */
export function createMailerFromEnv(
  env: Record<string, string | undefined> = process.env
): Mailer | null {
  const url = env.SMTP_URL

  if (!url || url.trim() === "") {
    return null
  }

  return createSmtpMailer({
    url,
    from: env.MAIL_FROM ?? DEFAULT_FROM,
  })
}
