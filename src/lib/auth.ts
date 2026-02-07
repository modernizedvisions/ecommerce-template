// TODO: Validate against a hashed ADMIN_PASSWORD stored in D1 via a Cloudflare Worker.
export async function verifyAdminPassword(password: string): Promise<boolean> {
  return password === 'admin123';
}
