import { onRequestPost as onCanonicalUploadPost } from './images/upload';

export const onRequestPost = onCanonicalUploadPost;

export async function onRequest(context: { request: Request; env: any }): Promise<Response> {
  const method = context.request.method.toUpperCase();
  if (method === 'POST') {
    return onCanonicalUploadPost(context as any);
  }
  return new Response(JSON.stringify({ ok: false, code: 'METHOD_NOT_ALLOWED' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' },
  });
}
