import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { PasswordResetEmailService } from './password-reset-email.service';

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));

describe('PasswordResetEmailService', () => {
  it('does not construct a transport when delivery is disabled', () => {
    const config = {
      get: jest.fn((key: string) =>
        key === 'PASSWORD_RESET_EMAIL_ENABLED' ? 'false' : undefined,
      ),
    } as unknown as ConfigService;

    const service = new PasswordResetEmailService(config);

    expect(service.isEnabled()).toBe(false);
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });

  it('sends the reset URL without loading remote or local content', async () => {
    const sendMail = jest
      .fn<Promise<{ messageId: string }>, [{ to?: string; text?: string }]>()
      .mockResolvedValue({ messageId: 'mail-1' });
    jest.mocked(nodemailer.createTransport).mockReturnValue({
      sendMail,
    } as never);
    const values: Record<string, string> = {
      PASSWORD_RESET_EMAIL_ENABLED: 'true',
      EMAIL_FROM: 'campus@example.edu',
      SMTP_HOST: 'smtp.example.edu',
      SMTP_PORT: '587',
      SMTP_USER: 'campus',
      SMTP_PASSWORD: 'secret',
      SMTP_SECURE: 'false',
    };
    const config = {
      get: jest.fn((key: string) => values[key]),
    } as unknown as ConfigService;

    const service = new PasswordResetEmailService(config);
    await service.sendPasswordReset({
      to: 'student@example.edu',
      login: 'student',
      resetUrl: 'https://campus.example.edu/reset-password?token=secret',
      expiresAt: new Date('2026-06-18T12:00:00.000Z'),
    });

    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        disableFileAccess: true,
        disableUrlAccess: true,
      }),
    );
    const sent = sendMail.mock.calls[0]?.[0];
    expect(sent?.to).toBe('student@example.edu');
    expect(sent?.text).toContain('reset-password?token=secret');
  });
});
