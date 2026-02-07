const PING_FINGERPRINT = 'ping-2025-12-21';

export async function onRequestGet(context: { request: Request }): Promise<Response> {
  const hostname = new URL(context.request.url).hostname;
  return new Response(
    JSON.stringify({
      ok: true,
      ts: new Date().toISOString(),
      hostname,
      fingerprint: PING_FINGERPRINT,
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}
