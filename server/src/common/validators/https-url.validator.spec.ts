import { isSafeHttpsUrl } from './https-url.validator';

describe('isSafeHttpsUrl', () => {
  it.each([
    'https://meet.google.com/abc',
    'https://10.example.com/room', // domain starting with digits — legitimate
    'https://zoom.us/j/123?pwd=x',
    'https://[::ffff:8.8.8.8]/', // IPv4-mapped, but a public address — legitimate
    'https://[2001:db8::1]/', // ordinary public IPv6 — behavior unchanged
    'https://[64:ff9b::808:808]/', // NAT64, public 8.8.8.8 — legitimate (fix round 2)
  ])('accepts %s', (url) => expect(isSafeHttpsUrl(url)).toBe(true));

  it.each([
    'http://meet.google.com/abc',
    'https://user:pass@meet.google.com/abc',
    'https://localhost/room',
    'https://127.0.0.1/room',
    'https://192.168.0.10/room',
    'https://172.16.0.1/room',
    'https://169.254.1.1/room',
    'https://[::1]/room',
    'https://[fc00::1]/room',
    `https://example.com/${'a'.repeat(2048)}`,
    'not a url',
    // Review fix round 1 (Critical): IPv4-mapped IPv6 — bypasses the SSRF filter.
    'https://[::ffff:127.0.0.1]/',
    'https://[::ffff:10.0.0.1]/',
    'https://[0:0:0:0:0:ffff:c0a8:1]/',
    // Review fix round 2 (Critical): deprecated IPv4-compatible ::/96 form — per contract
    // we reject ANY such address, regardless of the embedded value (even a public one).
    'https://[::127.0.0.1]/',
    'https://[::10.0.0.1]/',
    'https://[::8.8.8.8]/',
    // Review fix round 2 (Minor): NAT64 (64:ff9b::/96) with a private embedded IPv4.
    'https://[64:ff9b::7f00:1]/',
    'https://[64:ff9b::a00:1]/',
    // Review fix round 3 (Critical, residual defect): the high 16-bit group of the embedded address
    // is zero → Node compresses it into the leading `::` run, leaving only one (or zero) explicit
    // groups. `::2`/`::0:2` — both are canonicalized by Node into `[::2]` (deprecated form, unconditionally).
    'https://[::2]/',
    'https://[::0:2]/',
    'https://[64:ff9b::]/', // 64:ff9b::0.0.0.0 — zero explicit groups
    'https://[64:ff9b::2]/', // 64:ff9b::0.0.0.2 — high group compressed
    // Final wave I3: a trailing dot (root FQDN) must not bypass the localhost filter.
    'https://localhost./room',
    'https://foo.localhost./room',
    // Final wave I3: fe80::/10 (link-local) — previously only the literal `fe80:` prefix matched.
    'https://[fe90::1]/',
    'https://[febf::1]/',
    // Final wave I3: fec0::/10 (deprecated site-local, RFC 3879) — also a private range.
    'https://[fec0::1]/',
  ])('rejects %s', (url) => expect(isSafeHttpsUrl(url)).toBe(false));
});
