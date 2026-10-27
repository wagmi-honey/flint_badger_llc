// Business details. Keep these identical to the EIN letter and the Zoom 10DLC brand form.
export const site = {
  legalName: 'Flint Badger LLC',
  brandName: 'Flint Badger',
  domain: 'flintbadger.site',
  address: '116 Burch Oak Ln, Prestonsburg, KY 41653',
  phone: '(606) 262-1308',
  phoneE164: '+16062621308',
  email: 'contact@flintbadger.site',
  effectiveDate: 'May 16, 2026',
};

// Exact opt-in wording shown next to the checkbox and stored with every consent record.
// If you change it, update the Zoom campaign "message flow" answer to match.
export const SMS_CONSENT_TEXT =
  `I agree to receive text messages from ${site.legalName} at the phone number provided about my inquiry, ` +
  'project updates, scheduling, and customer support. Message frequency may vary. Message and data rates may apply. ' +
  'Reply STOP to opt out at any time. Reply HELP for help. Consent is not a condition of purchase. ' +
  'See our Privacy Policy and SMS Terms.';

export const SERVICES = ['Logo design', 'Branding', 'Website design', 'Other'];
