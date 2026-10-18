import { createHash, randomBytes } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

// Narrow HTTP/session safeguards adapted from RoomReady (MIT), itself derived
// from HoldThat 557def91. ClueKeeper owns its cookie, retention and game state.
export const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export function checkedOrigin(origin?: string, production = false): string | undefined {
  if (!origin) {
    if (production) throw new Error('Set the exact CLUEKEEPER_ORIGIN HTTPS origin in production.');
    return undefined;
  }
  const parsed = new URL(origin);
  if (parsed.origin !== origin || parsed.username || parsed.password ||
      !['http:', 'https:'].includes(parsed.protocol) || (production && parsed.protocol !== 'https:')) {
    throw new Error('CLUEKEEPER_ORIGIN must be an exact origin, without a path, credentials or query.');
  }
  return origin;
}
export function guard(origin?: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(self)');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; media-src 'self' blob:; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    const host = req.get('host') ?? '';
    const source = req.get('origin');
    const localHost = /^(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/.test(host);
    if (origin ? host !== new URL(origin).host : !localHost) {
      return res.status(403).json({ error: 'Unrecognized host.' });
    }
    const acceptedOrigins = origin ? [origin] : [`http://${host}`, 'http://127.0.0.1:5173', 'http://localhost:5173'];
    if (source && !acceptedOrigins.includes(source)) return res.status(403).json({ error: 'Different origin.' });
    if (req.get('sec-fetch-site') === 'cross-site') return res.status(403).json({ error: 'Cross-site request refused.' });
    next();
  };
}
export function identity(req: Request, res: Response, create = false, secure = false): string | null {
  const cookies = (req.headers.cookie ?? '').split(';').map(value => value.trim()).filter(value => value.startsWith('cluekeeper='));
  let token = cookies.length === 1 ? cookies[0].slice(11) : undefined;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    if (!create) { res.status(401).json({ error: 'Open ClueKeeper first.' }); return null; }
    token = randomBytes(32).toString('hex');
    res.setHeader('Set-Cookie', `cluekeeper=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${RETENTION_MS / 1000}${secure ? '; Secure' : ''}`);
  }
  return createHash('sha256').update(token).digest('hex');
}
