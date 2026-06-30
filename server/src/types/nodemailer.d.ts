declare module 'nodemailer' {
  export type SendMailOptions = {
    from: string;
    to: string | string[];
    subject: string;
    text?: string;
    html?: string;
  };

  export type TransportOptions = {
    host?: string;
    port?: number;
    secure?: boolean;
    auth?: {
      user: string;
      pass: string;
    };
    connectionTimeout?: number;
    greetingTimeout?: number;
    socketTimeout?: number;
    disableFileAccess?: boolean;
    disableUrlAccess?: boolean;
  };

  export type Transporter = {
    sendMail(message: SendMailOptions): Promise<unknown>;
  };

  export function createTransport(options: TransportOptions): Transporter;
}
