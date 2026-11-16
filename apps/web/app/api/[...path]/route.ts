import type { NextRequest } from 'next/server';

/**
 * Same-origin proxy to the API service. Keeps auth cookies first-party
 * (httpOnly, SameSite=Lax) and lets the API URL be configured at runtime
 * (API_INTERNAL_URL) instead of being baked into the build.
 */
const API = () => process.env.API_INTERNAL_URL ?? 'http://localhost:4000';
const HOP_BY_HOP = [
  'host',
  'connection',
  'content-length',
  'transfer-encoding',
  'keep-alive',
  'upgrade',
];

const forward = async (req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) => {
  const { path } = await ctx.params;
  const url = `${API()}/${path.join('/')}${req.nextUrl.search}`;
  const headers = new Headers(req.headers);
  for (const h of HOP_BY_HOP) headers.delete(h);

  const hasBody = !['GET', 'HEAD'].includes(req.method);
  const res = await fetch(url, {
    method: req.method,
    headers,
    body: hasBody ? req.body : undefined,
    redirect: 'manual',
    cache: 'no-store',
    // Node's fetch needs `duplex` to stream a request body (uploads).
    ...(hasBody ? { duplex: 'half' } : {}),
  } as RequestInit);

  const out = new Headers(res.headers);
  out.delete('content-encoding');
  out.delete('content-length');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: out });
};

export { forward as GET, forward as POST, forward as PUT, forward as PATCH, forward as DELETE };
