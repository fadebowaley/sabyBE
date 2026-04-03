const {
  normalizePhoneToE164,
  buildPhoneLookupCandidates,
  formatPhoneForDisplay,
} = require('../utils/phoneNumber');

describe('phoneNumber utils', () => {
  test('normalizes Nigerian local and international variants to canonical E.164', () => {
    expect(normalizePhoneToE164('08145045108', { allowEmpty: false })).toBe(
      '+2348145045108'
    );
    expect(normalizePhoneToE164('2348145045108', { allowEmpty: false })).toBe(
      '+2348145045108'
    );
    expect(normalizePhoneToE164('+2348145045108', { allowEmpty: false })).toBe(
      '+2348145045108'
    );
  });

  test('returns null for invalid values when empty not allowed', () => {
    expect(normalizePhoneToE164('abc', { allowEmpty: false })).toBeNull();
    expect(normalizePhoneToE164('', { allowEmpty: false })).toBeNull();
  });

  test('builds lookup candidates including canonical', () => {
    const out = buildPhoneLookupCandidates('08145045108');
    expect(out).toContain('+2348145045108');
    expect(out.length).toBeGreaterThan(0);
  });

  test('formats canonical value for readable international display', () => {
    expect(formatPhoneForDisplay('+2348145045108')).toBe('+234 814 504 5108');
  });
});
