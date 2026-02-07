import { sendEmail, type EmailEnv } from '../_lib/email';
import { ensureMessagesSchema } from './_lib/messagesSchema';

type D1PreparedStatement = {
  run(): Promise<{ success: boolean; error?: string }>;
  bind(...values: unknown[]): D1PreparedStatement;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

interface MessageInput {
  name?: string;
  email?: string;
  message?: string;
  imageUrl?: string | null;
  type?: 'message' | 'custom_order';
  categoryId?: string | null;
  categoryName?: string | null;
  categoryIds?: string[] | null;
  categoryNames?: string[] | null;
  inspoExampleId?: string | null;
  inspoTitle?: string | null;
  inspoImageUrl?: string | null;
}

type MessageEnv = {
  DB: D1Database;
} & EmailEnv;

type ParsedAttachment = {
  filename: string;
  content: string;
  contentType?: string;
};

const SUBJECT = 'New Inquiry - Dover Designs';

export async function onRequestPost(context: { env: MessageEnv; request: Request }): Promise<Response> {
  try {
    const debugMessages = (context.env as any).DEBUG_MESSAGES === '1';
    await ensureMessagesSchema(context.env.DB);
    const body = (await context.request.json().catch(() => null)) as MessageInput | null;
    const name = body?.name?.trim() || '';
    const email = body?.email?.trim() || '';
    const message = body?.message?.trim() || '';
    const type = body?.type === 'custom_order' ? 'custom_order' : 'message';
    let categoryIds = Array.isArray(body?.categoryIds)
      ? body!.categoryIds!.map((value) => String(value).trim()).filter(Boolean)
      : [];
    let categoryNames = Array.isArray(body?.categoryNames)
      ? body!.categoryNames!.map((value) => String(value).trim()).filter(Boolean)
      : [];
    if (categoryIds.length === 0 && body?.categoryId?.trim()) {
      categoryIds = [body.categoryId.trim()];
    }
    if (categoryNames.length === 0 && body?.categoryName?.trim()) {
      categoryNames = [body.categoryName.trim()];
    }
    const categoryId = categoryIds[0] ?? null;
    const categoryName = categoryNames[0] ?? null;
    const inspoExampleId = body?.inspoExampleId?.trim() || null;
    const inspoTitle = body?.inspoTitle?.trim() || null;
    const inspoImageUrl = body?.inspoImageUrl?.trim() || null;
    if (debugMessages) {
      console.log('[messages] payload', {
        contentType: context.request.headers.get('content-type'),
        hasImageUrl: !!body?.imageUrl,
        imageUrlLength: body?.imageUrl?.length ?? 0,
        nameLen: name.length,
        emailLen: email.length,
        messageLen: message.length,
        categoryCount: categoryNames.length,
      });
    }

    if (!name || !email || !message) {
      return jsonResponse({ success: false, error: 'Name, email, and message are required.' }, 400);
    }

    if (name.length > 120) {
      return jsonResponse({ success: false, error: 'Name is too long (max 120 characters).' }, 400);
    }
    if (email.length > 254) {
      return jsonResponse({ success: false, error: 'Email is too long (max 254 characters).' }, 400);
    }
    if (message.length > 5000) {
      return jsonResponse({ success: false, error: 'Message is too long (max 5000 characters).' }, 400);
    }
    if (body?.imageUrl && body.imageUrl.length > 1800000) {
      return jsonResponse(
        {
          success: false,
          code: 'IMAGE_TOO_LARGE',
          error: 'Image is too large. Please upload a smaller file.',
          message: 'Image is too large. Please upload a smaller file.',
        },
        400
      );
    }

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    const insert = context.env.DB.prepare(
      `INSERT INTO messages (
        id,
        name,
        email,
        message,
        image_url,
        type,
        category_id,
        category_name,
        category_ids_json,
        category_names_json,
        is_read,
        read_at,
        inspo_example_id,
        inspo_title,
        inspo_image_url,
        created_at
      )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      name,
      email,
      message,
      body?.imageUrl || null,
      type,
      categoryId,
      categoryName,
      JSON.stringify(categoryIds),
      JSON.stringify(categoryNames),
      0,
      null,
      inspoExampleId,
      inspoTitle,
      inspoImageUrl,
      createdAt
    );

    const result = await insert.run();
    if (!result.success) {
      console.error('[messages] Failed to insert message', result.error);
      return jsonResponse({ success: false, error: 'Failed to save message' }, 500);
    }

    const ownerTo = context.env.RESEND_OWNER_TO || context.env.EMAIL_OWNER_TO;
    if (!ownerTo) {
      console.error('[messages] Missing RESEND_OWNER_TO/EMAIL_OWNER_TO');
      return jsonResponse({ error: 'Failed to send email', detail: 'Missing owner email' }, 500);
    }

    const siteUrl = context.env.PUBLIC_SITE_URL || context.env.VITE_PUBLIC_SITE_URL || '';
    const adminUrl = siteUrl ? `${siteUrl.replace(/\/+$/, '')}/admin` : '/admin';
    const attachment = parseDataUrl(body?.imageUrl);
    if (body?.imageUrl && !attachment) {
      console.warn('[messages] Invalid image data URL; sending without attachment');
    }

    const textLines = [
      `New inquiry from ${name}`,
      `Email: ${email}`,
      `Type: ${type === 'custom_order' ? 'Custom Order' : 'Message'}`,
      categoryNames.length ? `Category: ${categoryNames.join(', ')}` : '',
      inspoTitle ? `Inspired by: ${inspoTitle}` : '',
      '',
      message,
      '',
      attachment ? 'Image attached.' : 'No image attached.',
      adminUrl ? `Admin: ${adminUrl}` : '',
    ].filter(Boolean);

    const typeLabel = type === 'custom_order' ? 'Custom Order' : 'Message';
    const baseFont = "'Inter', 'Helvetica Neue', Arial, sans-serif";
    const serifFont = "'Cormorant Garamond', Georgia, 'Times New Roman', serif";
    const baseColor = '#2F4F4F';
    const mutedColor = '#5f6f75';
    const borderColor = '#E6DFD4';
    const messageHtml = escapeHtml(message).replace(/\n/g, '<br/>');
    const inspoBlock =
      inspoTitle || inspoImageUrl
        ? `
          <div class="inspo-box">
            <div class="info-title">Inspired by</div>
            <div class="inspo-row">
              ${inspoImageUrl ? `<img src="${escapeHtml(inspoImageUrl)}" alt="${escapeHtml(inspoTitle || 'Inspiration')}" width="56" height="56" class="inspo-img" />` : ''}
              <div class="inspo-text">
                <div class="inspo-title">${escapeHtml(inspoTitle || 'Customer inspiration')}</div>
                ${inspoImageUrl ? `<a href="${escapeHtml(inspoImageUrl)}" class="inspo-link">View image</a>` : ''}
              </div>
            </div>
          </div>
        `
        : '';
    const categoryLine = categoryNames.length ? escapeHtml(categoryNames.join(', ')) : 'None selected';
    const attachmentLine = attachment ? 'Image attached.' : 'No image attached.';

    const html = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { margin:0; padding:0; background:#FBF9F5; }
    table { border-collapse:collapse; }
    img { border:0; line-height:100%; }
    body, table, td, a, p, div, span { font-family:${baseFont}; }
    .container { width:100%; background:#FBF9F5; }
    .inner { width:600px; max-width:600px; background:#ffffff; border-radius:28px; border:1px solid ${borderColor}; overflow:hidden; box-shadow:0 24px 56px rgba(31,41,51,0.12); }
    .pad { padding:32px 22px 36px; }
    .inner-pad { padding:30px 28px 32px; }
    .section { padding-bottom:22px; }
    .brand { font-size:20px; font-weight:600; color:${baseColor}; font-family:${serifFont}; letter-spacing:0.04em; }
    .order-label { font-size:12px; letter-spacing:0.12em; text-transform:uppercase; color:${mutedColor}; white-space:nowrap; }
    .title { font-size:28px; font-weight:600; color:${baseColor}; margin:0 0 6px; font-family:${serifFont}; letter-spacing:0.02em; }
    .subtitle { font-size:14px; color:${mutedColor}; margin:0; }
    .button { display:inline-block; padding:12px 22px; background:${baseColor}; color:#ffffff !important; text-decoration:none !important; border-radius:9999px; font-size:14px; font-weight:600; letter-spacing:0.08em; }
    .subhead { font-size:13px; letter-spacing:0.18em; text-transform:uppercase; color:${mutedColor}; margin:0 0 8px; }
    .meta-table td { padding:6px 0; font-size:14px; color:${mutedColor}; }
    .meta-label { width:140px; font-size:12px; letter-spacing:0.12em; text-transform:uppercase; color:${mutedColor}; }
    .meta-value { font-size:14px; color:${baseColor}; font-weight:600; }
    .message-box { padding:16px 18px; border:1px solid #ededed; border-radius:18px; background:#FBF9F5; color:${baseColor}; font-size:15px; line-height:1.6; }
    .info-title { font-size:11px; letter-spacing:0.12em; text-transform:uppercase; color:${mutedColor}; margin:0 0 6px; white-space:nowrap; }
    .info { font-size:14px; color:${baseColor}; line-height:1.5; margin:0; }
    .inspo-box { margin-top:16px; padding:14px 16px; border:1px solid #ededed; border-radius:18px; background:#ffffff; }
    .inspo-row { display:flex; gap:12px; align-items:center; }
    .inspo-img { width:56px; height:56px; border-radius:14px; border:1px solid ${borderColor}; object-fit:cover; display:block; }
    .inspo-title { font-size:14px; font-weight:600; color:${baseColor}; }
    .inspo-link { display:inline-block; margin-top:4px; font-size:12px; color:${baseColor}; text-decoration:underline; }
    .footer { padding-top:16px; font-size:12px; color:${mutedColor}; }
    @media screen and (max-width: 640px) {
      .pad { padding:24px 16px 30px; }
      .inner-pad { padding:24px 18px 28px; }
      .title { font-size:24px; }
      .meta-label { width:120px; }
    }
  </style>
</head>
<body>
  <table role="presentation" class="container" width="100%" cellspacing="0" cellpadding="0">
    <tr>
      <td align="center" class="pad">
        <table role="presentation" class="inner" width="600" cellspacing="0" cellpadding="0">
          <tr>
            <td class="inner-pad">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td class="section brand">Dover Designs</td>
                  <td class="section order-label" align="right">Inquiry</td>
                </tr>
                <tr>
                  <td class="section" colspan="2">
                    <p class="title">New Inquiry</p>
                    <p class="subtitle">${escapeHtml(typeLabel)} received from the contact form.</p>
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:14px;">
                      <tr>
                        <td bgcolor="${baseColor}" style="border-radius:9999px;">
                          <a href="${escapeHtml(adminUrl)}" class="button">View in Admin</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td class="section" colspan="2">
                    <p class="subhead">Inquiry details</p>
                    <table role="presentation" class="meta-table" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td class="meta-label">From</td>
                        <td class="meta-value">${escapeHtml(name)}</td>
                      </tr>
                      <tr>
                        <td class="meta-label">Email</td>
                        <td class="meta-value"><a href="mailto:${escapeHtml(email)}" style="color:${baseColor}; text-decoration:none;">${escapeHtml(email)}</a></td>
                      </tr>
                      <tr>
                        <td class="meta-label">Type</td>
                        <td class="meta-value">${escapeHtml(typeLabel)}</td>
                      </tr>
                      <tr>
                        <td class="meta-label">Categories</td>
                        <td class="meta-value">${categoryLine}</td>
                      </tr>
                      <tr>
                        <td class="meta-label">Attachment</td>
                        <td class="meta-value">${attachmentLine}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td class="section" colspan="2">
                    <p class="subhead">Message</p>
                    <div class="message-box">${messageHtml}</div>
                    ${inspoBlock}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const emailResult = await sendEmail(
      {
        to: ownerTo,
        subject: SUBJECT,
        text: textLines.join('\n'),
        html,
        replyTo: email,
        attachments: attachment ? [attachment] : undefined,
      },
      context.env
    );

    if (!emailResult.ok) {
      console.error('[messages] Failed to send email', emailResult.error);
      return jsonResponse({ error: 'Failed to send email', detail: emailResult.error }, 500);
    }

    return jsonResponse({ success: true, id, createdAt });
  } catch (err) {
    console.error('[messages] Error handling message submission', err);
    return jsonResponse({ success: false, error: 'Server error saving message' }, 500);
  }
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json',
    },
  });
}

function parseDataUrl(value?: string | null): ParsedAttachment | null {
  if (!value || !value.startsWith('data:')) return null;
  const [header, base64] = value.split(',', 2);
  if (!header || !base64) return null;
  const match = header.match(/^data:([^;]+);base64$/i);
  if (!match) return null;
  const contentType = match[1].toLowerCase();
  const extension = contentTypeToExtension(contentType);
  return {
    filename: `contact-upload.${extension}`,
    content: base64,
    contentType,
  };
}

function contentTypeToExtension(contentType: string) {
  switch (contentType) {
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg';
    case 'image/gif':
      return 'gif';
    case 'image/webp':
      return 'webp';
    case 'image/png':
    default:
      return 'png';
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
