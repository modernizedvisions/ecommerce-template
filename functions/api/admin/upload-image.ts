import { requireAdmin } from '../_lib/adminAuth';

// Stub upload endpoint to be replaced with real storage (e.g., R2 or Cloudflare Images).
export async function onRequestPost(context: { request: Request; env: { ADMIN_PASSWORD?: string } }): Promise<Response> {
  try {
    const unauthorized = await requireAdmin(context.request, context.env);
    if (unauthorized) return unauthorized;
    const contentType = context.request.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return new Response(JSON.stringify({ error: 'Content-Type must be multipart/form-data' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const formData = await context.request.formData();
    const files = formData.getAll('file').filter((f) => f instanceof File) as File[];
    if (!files.length) {
      return new Response(JSON.stringify({ error: 'file field is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const urls = files.map((file, index) => {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '');
      return `/uploads/mock-${Date.now()}-${index}-${safeName}`;
    });

    // TODO: upload file(s) to persistent storage (R2/Images) and return the public URL(s).

    return new Response(JSON.stringify({ urls }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Upload failed', error);
    return new Response(JSON.stringify({ error: 'Upload failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function onRequest(context: { request: Request; env: { ADMIN_PASSWORD?: string } }): Promise<Response> {
  const unauthorized = await requireAdmin(context.request, context.env);
  if (unauthorized) return unauthorized;
  if (context.request.method.toUpperCase() === 'POST') {
    return onRequestPost(context);
  }
  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' },
  });
}

