const DEFAULT_COUNTRY_CODE = '234';

const sanitizePhoneInput = (value) => String(value == null ? '' : value).trim();

const normalizePhoneToE164 = (value, options = {}) => {
  const { defaultCountryCode = DEFAULT_COUNTRY_CODE, allowEmpty = true } = options;
  const raw = sanitizePhoneInput(value);
  if (!raw) {
    return allowEmpty ? '' : null;
  }

  const normalizedChars = raw.replace(/[^\d+]/g, '');
  if (!normalizedChars) {
    return null;
  }

  const hasPlus = normalizedChars.startsWith('+');
  const digits = normalizedChars.replace(/\D/g, '');
  if (!digits) {
    return null;
  }

  // Canonical Nigerian cases
  if (digits.startsWith(defaultCountryCode)) {
    const nsn = digits.slice(defaultCountryCode.length);
    if (nsn.length === 10) {
      return `+${defaultCountryCode}${nsn}`;
    }
    if (nsn.length === 11 && nsn.startsWith('0')) {
      return `+${defaultCountryCode}${nsn.slice(1)}`;
    }
  }

  // Local Nigerian with leading 0 (e.g. 08107771205)
  if (!hasPlus && digits.length === 11 && digits.startsWith('0')) {
    return `+${defaultCountryCode}${digits.slice(1)}`;
  }

  // Local Nigerian without leading 0 (10-digit NSN)
  if (!hasPlus && digits.length === 10) {
    return `+${defaultCountryCode}${digits}`;
  }

  // Generic international fallback
  if (hasPlus && digits.length >= 8 && digits.length <= 15) {
    return `+${digits}`;
  }

  if (!hasPlus && digits.length >= 11 && digits.length <= 15) {
    return `+${digits}`;
  }

  return null;
};

const buildPhoneLookupCandidates = (value) => {
  const raw = sanitizePhoneInput(value);
  if (!raw) return [];

  const cleaned = raw.replace(/[\s\-()]/g, '');
  const digits = cleaned.replace(/\D/g, '');
  const out = new Set();

  const canonical = normalizePhoneToE164(raw, { allowEmpty: false });
  if (canonical) out.add(canonical);

  if (cleaned) out.add(cleaned);
  if (digits) {
    out.add(digits);
    out.add(`+${digits}`);
  }

  if (cleaned.startsWith('+')) {
    out.add(cleaned.slice(1));
  } else if (cleaned) {
    out.add(`+${cleaned}`);
  }

  if (digits.length >= 10) {
    out.add(digits.slice(-10));
  }

  return Array.from(out).filter(Boolean);
};

const formatPhoneForDisplay = (value) => {
  const canonical = normalizePhoneToE164(value, { allowEmpty: true });
  if (!canonical) return '';

  const digits = canonical.slice(1);
  if (digits.startsWith(DEFAULT_COUNTRY_CODE) && digits.length === 13) {
    const local = digits.slice(DEFAULT_COUNTRY_CODE.length);
    return `+${DEFAULT_COUNTRY_CODE} ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
  }

  if (digits.length > 4) {
    return `+${digits.slice(0, 3)} ${digits.slice(3)}`;
  }

  return canonical;
};

module.exports = {
  normalizePhoneToE164,
  buildPhoneLookupCandidates,
  formatPhoneForDisplay,
};
