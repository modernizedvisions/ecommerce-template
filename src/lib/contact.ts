// TODO: Implement via Cloudflare Worker + Resend when backend is ready.
export async function sendContactEmail(data: { name: string; email: string; message: string }) {
  console.info('Mock sendContactEmail', data);
  return { success: true };
}
