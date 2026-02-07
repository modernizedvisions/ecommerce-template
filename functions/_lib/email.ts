export type SendEmailArgs = {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
  logTo?: string | string[];
};

export type EmailEnv = {
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
  RESEND_FROM_EMAIL?: string;
  RESEND_REPLY_TO?: string;
  RESEND_REPLY_TO_EMAIL?: string;
  RESEND_OWNER_TO?: string;
  EMAIL_FROM?: string;
  EMAIL_OWNER_TO?: string;
  PUBLIC_SITE_URL?: string;
  VITE_PUBLIC_SITE_URL?: string;
};

export type EmailAttachment = {
  filename: string;
  content: string;
  contentType?: string;
};

export const DEFAULT_FROM_EMAIL = 'Dover Designs <doverdesignsshells@gmail.com>';

export function resolveFromEmail(env: EmailEnv): string {
  return env.RESEND_FROM || env.RESEND_FROM_EMAIL || env.EMAIL_FROM || DEFAULT_FROM_EMAIL;
}

export async function sendEmail(
  args: SendEmailArgs,
  env: EmailEnv
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const apiKey = env.RESEND_API_KEY;
  const from = resolveFromEmail(env);
  const replyTo = env.RESEND_REPLY_TO || env.RESEND_REPLY_TO_EMAIL || args.replyTo;

  if (!apiKey || !from) {
    return {
      ok: false,
      error: 'Missing RESEND_API_KEY or sender email',
    };
  }

  if (!args.to || !args.subject || (!args.html && !args.text)) {
    return {
      ok: false,
      error: 'Missing to, subject, or body (html/text)',
    };
  }

  try {
    const logTo = args.logTo ?? args.to;
    console.log('[email]', { from, to: logTo, subject: args.subject });

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to: Array.isArray(args.to) ? args.to : [args.to],
        subject: args.subject,
        html: args.html,
        text: args.text,
        reply_to: replyTo,
        attachments: args.attachments?.map((attachment) => ({
          filename: attachment.filename,
          content: attachment.content,
          content_type: attachment.contentType,
        })),
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('[email] Resend error response', data);
      return { ok: false, error: data?.message || 'Resend request failed' };
    }

    const id = (data as any)?.id || '';
    return { ok: true, id };
  } catch (err: any) {
    console.error('[email] Failed to send email', err);
    return { ok: false, error: err?.message || 'Unknown email error' };
  }
}
