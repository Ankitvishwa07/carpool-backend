// Single source of truth for allowed domains, driven by env var so it's
// configurable per deployment (e.g. "acme.com,acme-corp.edu").
// This is the SAME list the User schema validator checks — keeping both in
// sync means a bad signup gets a friendly 403 here instead of a raw
// mongoose ValidationError.
const ALLOWED_EMAIL_DOMAINS = (process.env.ALLOWED_EMAIL_DOMAINS || '')
  .split(',')
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

function isAllowedEmailDomain(email) {
  if (ALLOWED_EMAIL_DOMAINS.length === 0) return true; // no restriction configured (dev mode)

  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return false;

  return ALLOWED_EMAIL_DOMAINS.includes(domain);
}

module.exports = { isAllowedEmailDomain, ALLOWED_EMAIL_DOMAINS };