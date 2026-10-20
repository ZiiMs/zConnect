import { describe, expect, test } from "bun:test"
import {
  createMailerFromEnv,
  createMemoryMailer,
  createSmtpMailer,
} from "./mailer.js"

describe("createMemoryMailer", () => {
  test("records every message in order", async () => {
    const mailer = createMemoryMailer()

    await mailer.send({
      to: "ada@example.com",
      subject: "Invitation",
      text: "Join the workspace",
    })
    await mailer.send({
      to: "grace@example.com",
      subject: "Mention",
      text: "You were mentioned",
      html: "<p>You were mentioned</p>",
    })

    expect(mailer.sent).toEqual([
      {
        to: "ada@example.com",
        subject: "Invitation",
        text: "Join the workspace",
      },
      {
        to: "grace@example.com",
        subject: "Mention",
        text: "You were mentioned",
        html: "<p>You were mentioned</p>",
      },
    ])
  })

  test("reset forgets what was sent", async () => {
    const mailer = createMemoryMailer()
    await mailer.send({ to: "ada@example.com", subject: "Hi", text: "Hello" })

    mailer.reset()

    expect(mailer.sent).toEqual([])
  })
})

describe("createMailerFromEnv", () => {
  test("returns null without SMTP_URL", () => {
    expect(createMailerFromEnv({})).toBeNull()
  })

  test("returns null for an empty or blank SMTP_URL", () => {
    expect(createMailerFromEnv({ SMTP_URL: "" })).toBeNull()
    expect(createMailerFromEnv({ SMTP_URL: "   " })).toBeNull()
  })

  test("returns a mailer when SMTP_URL is set", () => {
    const mailer = createMailerFromEnv({
      SMTP_URL: "smtp://localhost:2525",
    })

    expect(mailer).not.toBeNull()
    expect(typeof mailer?.send).toBe("function")
  })

  test("reads the environment when called, not at import time", () => {
    const previous = process.env.SMTP_URL

    try {
      delete process.env.SMTP_URL
      expect(createMailerFromEnv()).toBeNull()

      process.env.SMTP_URL = "smtp://localhost:2525"
      expect(createMailerFromEnv()).not.toBeNull()
    } finally {
      if (previous === undefined) {
        delete process.env.SMTP_URL
      } else {
        process.env.SMTP_URL = previous
      }
    }
  })
})

describe("createSmtpMailer", () => {
  // Construction is lazy in nodemailer: no connection until sendMail, so these
  // assertions must not open sockets or send real mail.
  test("accepts an smtp:// URL without connecting", () => {
    expect(() =>
      createSmtpMailer({
        url: "smtp://user:pass@smtp.example.com:587",
        from: "zConnect <no-reply@example.com>",
      })
    ).not.toThrow()
  })

  test("accepts an smtps:// URL without connecting", () => {
    expect(() =>
      createSmtpMailer({
        url: "smtps://user:pass@smtp.example.com:465",
        from: "zConnect <no-reply@example.com>",
      })
    ).not.toThrow()
  })
})
