type PresignInput = {
  accountId: string;
  bucketName: string;
  accessKeyId: string;
  secretAccessKey: string;
  storageKey: string;
  contentType: string;
  expiresSeconds?: number;
  now?: Date;
};

const textEncoder = new TextEncoder();

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(value));
  return toHex(new Uint8Array(digest));
};

const hmacSha256 = async (keyBytes: Uint8Array, message: string): Promise<Uint8Array> => {
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, textEncoder.encode(message));
  return new Uint8Array(signature);
};

const formatAmzDate = (date: Date): { amzDate: string; dateStamp: string } => {
  const iso = date.toISOString();
  const datePart = iso.slice(0, 10).replace(/-/g, '');
  const timePart = iso.slice(11, 19).replace(/:/g, '');
  return {
    amzDate: `${datePart}T${timePart}Z`,
    dateStamp: datePart,
  };
};

const encodeRfc3986 = (value: string): string =>
  encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);

const canonicalQuery = (params: Record<string, string>): string =>
  Object.keys(params)
    .sort()
    .map((key) => `${encodeRfc3986(key)}=${encodeRfc3986(params[key])}`)
    .join('&');

const canonicalPathKey = (storageKey: string): string =>
  storageKey
    .split('/')
    .map((segment) => encodeRfc3986(segment))
    .join('/');

export async function createR2PresignedPutUrl(input: PresignInput): Promise<{
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
}> {
  const now = input.now || new Date();
  const expiresSeconds = Math.max(1, Math.min(300, Math.floor(input.expiresSeconds ?? 300)));

  const region = 'auto';
  const service = 's3';
  const host = `${input.accountId}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${encodeRfc3986(input.bucketName)}/${canonicalPathKey(input.storageKey)}`;

  const { amzDate, dateStamp } = formatAmzDate(now);
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const algorithm = 'AWS4-HMAC-SHA256';
  const signedHeaders = 'content-type;host;x-amz-content-sha256';

  const queryParams: Record<string, string> = {
    'X-Amz-Algorithm': algorithm,
    'X-Amz-Credential': `${input.accessKeyId}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresSeconds),
    'X-Amz-SignedHeaders': signedHeaders,
  };

  const canonicalQueryString = canonicalQuery(queryParams);
  const canonicalHeaders =
    `content-type:${input.contentType}\n` +
    `host:${host}\n` +
    `x-amz-content-sha256:UNSIGNED-PAYLOAD\n`;

  const canonicalRequest = [
    'PUT',
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const hashedCanonicalRequest = await sha256Hex(canonicalRequest);
  const stringToSign = [algorithm, amzDate, credentialScope, hashedCanonicalRequest].join('\n');

  const kDate = await hmacSha256(textEncoder.encode(`AWS4${input.secretAccessKey}`), dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  const kSigning = await hmacSha256(kService, 'aws4_request');
  const signatureBytes = await hmacSha256(kSigning, stringToSign);
  const signature = toHex(signatureBytes);

  const url = `https://${host}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`;

  return {
    url,
    method: 'PUT',
    headers: {
      'Content-Type': input.contentType,
      'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
    },
  };
}
