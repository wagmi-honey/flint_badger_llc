import { SERVICES } from './site.js';

const LIMITS = { name: 100, email: 254, phone: 30, service: 50, details: 5000 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const text = (value) => (typeof value === 'string' ? value.trim() : '');

// Returns a US number as +1XXXXXXXXXX, or null if it is not a valid 10-digit NANP number.
export function normalizeUsPhone(input) {
  let digits = input.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return null;
  return `+1${digits}`;
}

export function validateContact(body = {}) {
  const values = {
    name: text(body.name),
    email: text(body.email),
    phone: text(body.phone),
    service: text(body.service),
    details: text(body.details),
    smsConsent: body.sms_consent === 'yes',
  };
  const errors = {};

  for (const [field, max] of Object.entries(LIMITS)) {
    if (values[field].length > max) errors[field] = `Please keep this under ${max} characters.`;
  }
  if (!values.name) errors.name ??= 'Please enter your name.';
  if (!values.email) errors.email ??= 'Please enter your email address.';
  else if (!EMAIL_RE.test(values.email)) errors.email ??= 'Please enter a valid email address.';
  if (!values.details) errors.details ??= 'Please tell us a little about your project.';
  if (values.service && !SERVICES.includes(values.service)) errors.service ??= 'Please choose a service from the list.';

  let phoneE164 = null;
  if (values.phone) {
    phoneE164 = normalizeUsPhone(values.phone);
    if (!phoneE164) errors.phone ??= 'Please enter a 10-digit US mobile number.';
  } else if (values.smsConsent) {
    errors.phone = 'Enter your mobile number to receive text messages, or uncheck the text message box.';
  }

  return { values, errors, phoneE164, valid: Object.keys(errors).length === 0 };
}
