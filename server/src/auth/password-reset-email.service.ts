import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Transporter, TransportOptions } from 'nodemailer';

export type PasswordResetEmail = {
  to: string;
  login: string;
  resetUrl: string;
  expiresAt: Date;
};

@Injectable()
export class PasswordResetEmailService {
  private readonly logger = new Logger(PasswordResetEmailService.name);
  private readonly enabled: boolean;
  private readonly from: string;
  private readonly transportOptions?: TransportOptions;
  private transporter?: Transporter;

  constructor(config: ConfigService) {
    this.enabled =
      config.get<string>('PASSWORD_RESET_EMAIL_ENABLED') === 'true';
    this.from = config.get<string>('EMAIL_FROM') ?? '';

    if (!this.enabled) {
      return;
    }

    const host = config.get<string>('SMTP_HOST');
    const port = Number(config.get<string>('SMTP_PORT') ?? 587);
    const user = config.get<string>('SMTP_USER');
    const pass = config.get<string>('SMTP_PASSWORD');

    if (!host || !this.from) {
      throw new Error('Password reset email transport is not configured');
    }

    this.transportOptions = {
      host,
      port,
      secure: config.get<string>('SMTP_SECURE') === 'true',
      auth: user && pass ? { user, pass } : undefined,
      connectionTimeout: Number(
        config.get<string>('SMTP_CONNECTION_TIMEOUT_MS') ?? 10_000,
      ),
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
      disableFileAccess: true,
      disableUrlAccess: true,
    };
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async sendPasswordReset(message: PasswordResetEmail): Promise<void> {
    if (!this.enabled) {
      return;
    }

    const transporter = await this.getTransporter();
    const expiresAt = message.expiresAt.toISOString();
    await transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: 'Відновлення пароля — Електронний кампус МАУП',
      text: [
        `Вітаємо, ${message.login}.`,
        '',
        'Для відновлення пароля відкрийте посилання:',
        message.resetUrl,
        '',
        `Посилання дійсне до ${expiresAt}.`,
        'Якщо ви не надсилали цей запит, проігноруйте лист.',
      ].join('\n'),
      html: buildPasswordResetHtml(message.login, message.resetUrl, expiresAt),
    });

    this.logger.log('Password reset email accepted by SMTP transport');
  }

  private async getTransporter(): Promise<Transporter> {
    if (this.transporter) {
      return this.transporter;
    }

    if (!this.transportOptions) {
      throw new Error('Password reset email transport is not configured');
    }

    const { createTransport } = await import('nodemailer');
    this.transporter = createTransport(this.transportOptions);

    return this.transporter;
  }
}

function buildPasswordResetHtml(
  login: string,
  resetUrl: string,
  expiresAt: string,
): string {
  const safeLogin = escapeHtml(login);
  const safeUrl = escapeHtml(resetUrl);
  const safeExpiresAt = escapeHtml(expiresAt);

  return `<!doctype html>
<html lang="uk"><body style="font-family:Arial,sans-serif;color:#172033;line-height:1.5">
  <h1 style="font-size:20px">Відновлення пароля</h1>
  <p>Вітаємо, ${safeLogin}.</p>
  <p><a href="${safeUrl}" style="display:inline-block;padding:12px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px">Змінити пароль</a></p>
  <p>Посилання дійсне до ${safeExpiresAt}.</p>
  <p>Якщо ви не надсилали цей запит, проігноруйте лист.</p>
</body></html>`;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character] ?? character,
  );
}
