const {
  normalizePhoneToE164,
  buildPhoneLookupCandidates,
  formatPhoneForDisplay,
} = require('../utils/phoneNumber');

describe('phoneNumber utils', () => {
  test('normalizes Nigerian local and international variants to canonical E.164', () => {
    expect(normalizePhoneToE164('08107771205', { allowEmpty: false })).toBe(
      '+2348107771205'
    );
    expect(normalizePhoneToE164('2348107771205', { allowEmpty: false })).toBe(
      '+2348107771205'
    );
    expect(normalizePhoneToE164('+2348107771205', { allowEmpty: false })).toBe(
      '+2348107771205'
    );
  });

  test('returns null for invalid values when empty not allowed', () => {
    expect(normalizePhoneToE164('abc', { allowEmpty: false })).toBeNull();
    expect(normalizePhoneToE164('', { allowEmpty: false })).toBeNull();
  });

  test('builds lookup candidates including canonical', () => {
    const out = buildPhoneLookupCandidates('08107771205');
    expect(out).toContain('+2348107771205');
    expect(out.length).toBeGreaterThan(0);
  });

  test('formats canonical value for readable international display', () => {
    expect(formatPhoneForDisplay('+2348107771205')).toBe('+234 810 777 1205');
  });
});
