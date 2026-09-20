import { registerDecorator, ValidationOptions } from 'class-validator';

// Spec §8: https-only, no userinfo, ≤ 2048, host not from private/reserved ranges.
// Range checks apply ONLY to IP literals: a regex like /^10\./ against the host string
// would also block a legitimate domain like `10.example.com` (review m8).
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function isPrivateIpv4(host: string): boolean {
  const m = IPV4.exec(host);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (
    [a, b, Number(m[3]), Number(m[4])].some(
      (o) => !Number.isInteger(o) || o > 255,
    )
  )
    return true;
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}

// Review fix round 1/2/3 (Critical): IPv6 literals that embed IPv4 in the last 32 bits.
// Node canonicalizes URL.hostname into hex-octet form instead of dotted-quad
// (e.g. `[::ffff:127.0.0.1]` → `[::ffff:7f00:1]`), so each of the three prefixes
// must be unpacked back into IPv4 and run through isPrivateIpv4:
//  - `::ffff:XXXX:YYYY`   — IPv4-mapped (RFC 4291 §2.5.5.2). Private only if the embedded IPv4
//    is private (public e.g. `::ffff:8.8.8.8` is legitimate). Always exactly two groups: the leading
//    zero-run is already "spent" on compression before `ffff`, so a second `::` collapsing the high
//    16-bit group of the embedded address is impossible (verified: `::ffff:0.0.0.2` → `[::ffff:0:2]`).
//  - `64:ff9b::XXXX:YYYY` — NAT64 well-known prefix (RFC 6052 §2.1). Same rule — private only
//    if the embedded IPv4 is private (`64:ff9b::8.8.8.8` is legitimate).
//  - `::XXXX:YYYY`        — deprecated IPv4-compatible form (RFC 4291 §2.5.5.1, deprecated).
//    No legitimate public service emits this form, so we treat ANY such address as private
//    UNCONDITIONALLY (regardless of the embedded value) — review fix round 2 decision: don't trust
//    the deprecated form as a channel for a "public" IPv4 address. `::1`/`::` are checked separately above.
// Review fix round 3 (Critical, residual defect): unlike `::ffff:`, the `::` and
// `64:ff9b::` prefixes compress the HIGH 16-bit group of the embedded address into the same leading
// `::` run when it is zero (`0.0.x.y`) — only ONE group remains (`::0.0.0.2` → `[::2]`), and for
// `64:ff9b::0.0.0.0` BOTH are compressed (`[64:ff9b::]`, zero explicit groups). So for these two
// prefixes we treat a missing high group as 0 — otherwise `https://[::2]/` and `https://[64:ff9b::]/`
// would pass as "safe".
// We don't match the `0:0:0:0:0:ffff:XXXX:YYYY` form separately: Node already canonicalizes it to `::ffff:XXXX:YYYY`
// before the host reaches here (verified — `new URL('https://[0:0:0:0:0:ffff:c0a8:1]/').hostname`
// → `[::ffff:c0a8:1]`), so a separate branch for it would have been dead code.
// Deliberately out of scope (not handled, documented for future readers): RFC 8215
// NAT64 `64:ff9b:1::/48` (local network NAT64 prefixes, not well-known) and 6to4 `2002::/16`
// (embedded IPv4 in bits 16–48, different position and unpacking format).
const TWO_GROUP_EMBEDDED =
  /^(::ffff:|64:ff9b::|::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/;
const ONE_GROUP_EMBEDDED = /^(64:ff9b::|::)([0-9a-f]{1,4})$/;

function embeddedIpv4(
  addr: string,
): { ip: string; deprecated: boolean } | null {
  let prefix: string;
  let hi = 0;
  let lo = 0;
  const two = TWO_GROUP_EMBEDDED.exec(addr);
  if (two) {
    prefix = two[1];
    hi = parseInt(two[2], 16);
    lo = parseInt(two[3], 16);
  } else {
    const one = ONE_GROUP_EMBEDDED.exec(addr);
    if (one) {
      prefix = one[1];
      lo = parseInt(one[2], 16);
    } else if (addr === '64:ff9b::') {
      prefix = '64:ff9b::';
    } else {
      return null;
    }
  }
  const ip = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
  return { ip, deprecated: prefix === '::' };
}

function isPrivateIpv6(host: string): boolean {
  // URL.hostname for IPv6 returns the address in square brackets.
  if (!host.startsWith('[') || !host.endsWith(']')) return false;
  const addr = host.slice(1, -1).toLowerCase();
  if (addr === '::1' || addr === '::') return true;
  // fe80::/10 (link-local) = first group fe80–febf, i.e. fe8x/fe9x/feax/febx.
  // fec0::/10 (deprecated site-local, RFC 3879) = first group fec0–feff — also a private range.
  if (
    /^f[cd][0-9a-f]{2}:/.test(addr) ||
    /^fe[89ab][0-9a-f]:/.test(addr) ||
    /^fe[c-f][0-9a-f]:/.test(addr)
  )
    return true;
  const embedded = embeddedIpv4(addr);
  if (!embedded) return false;
  return embedded.deprecated || isPrivateIpv4(embedded.ip);
}

export function isSafeHttpsUrl(value: unknown): boolean {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048)
    return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    if (url.username || url.password) return false;
    // Strip a single trailing dot (root FQDN, e.g. `localhost.`) before all host checks.
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    if (host === 'localhost' || host.endsWith('.localhost')) return false;
    if (isPrivateIpv4(host) || isPrivateIpv6(host)) return false;
    return true;
  } catch {
    return false;
  }
}

export function IsSafeHttpsUrl(options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'isSafeHttpsUrl',
      target: object.constructor,
      propertyName,
      options: {
        message: 'Посилання має бути HTTPS без облікових даних',
        ...options,
      },
      validator: { validate: isSafeHttpsUrl },
    });
}
