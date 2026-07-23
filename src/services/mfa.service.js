const crypto = require('crypto');
const httpStatus = require('http-status');
const { User } = require('../models');
const ApiError = require('../utils/ApiError');

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const ISSUER = 'Saby';
const PASSKEY_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MFA_LOGIN_CHALLENGE_TTL_MS = 5 * 60 * 1000;

const base64urlEncode = (input) =>
  Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

const base64urlDecode = (value) => {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
  return Buffer.from(padded, 'base64');
};

const resolveWebAuthnOrigin = () =>
  String(
    process.env.SABY_WEBAUTHN_ORIGIN ||
      process.env.SABYFE_URL ||
      process.env.FRONTEND_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      'http://localhost:3000'
  ).replace(/\/+$/g, '');

const resolveWebAuthnRpId = () => {
  if (process.env.SABY_WEBAUTHN_RP_ID) return process.env.SABY_WEBAUTHN_RP_ID;
  return new URL(resolveWebAuthnOrigin()).hostname;
};

const readCborLength = (buffer, offset, additionalInfo) => {
  if (additionalInfo < 24) return { length: additionalInfo, offset };
  if (additionalInfo === 24) return { length: buffer.readUInt8(offset), offset: offset + 1 };
  if (additionalInfo === 25) return { length: buffer.readUInt16BE(offset), offset: offset + 2 };
  if (additionalInfo === 26) return { length: buffer.readUInt32BE(offset), offset: offset + 4 };
  throw new Error('Unsupported CBOR length');
};

const readCbor = (buffer, startOffset = 0) => {
  const firstByte = buffer.readUInt8(startOffset);
  const majorType = firstByte >> 5;
  const additionalInfo = firstByte & 0x1f;
  let offset = startOffset + 1;

  if (majorType === 0) {
    const result = readCborLength(buffer, offset, additionalInfo);
    return { value: result.length, offset: result.offset };
  }
  if (majorType === 1) {
    const result = readCborLength(buffer, offset, additionalInfo);
    return { value: -1 - result.length, offset: result.offset };
  }
  if (majorType === 2) {
    const result = readCborLength(buffer, offset, additionalInfo);
    return {
      value: buffer.subarray(result.offset, result.offset + result.length),
      offset: result.offset + result.length,
    };
  }
  if (majorType === 3) {
    const result = readCborLength(buffer, offset, additionalInfo);
    return {
      value: buffer.toString('utf8', result.offset, result.offset + result.length),
      offset: result.offset + result.length,
    };
  }
  if (majorType === 4) {
    const result = readCborLength(buffer, offset, additionalInfo);
    offset = result.offset;
    const value = [];
    for (let index = 0; index < result.length; index += 1) {
      const item = readCbor(buffer, offset);
      value.push(item.value);
      offset = item.offset;
    }
    return { value, offset };
  }
  if (majorType === 5) {
    const result = readCborLength(buffer, offset, additionalInfo);
    offset = result.offset;
    const value = {};
    for (let index = 0; index < result.length; index += 1) {
      const key = readCbor(buffer, offset);
      const item = readCbor(buffer, key.offset);
      value[key.value] = item.value;
      offset = item.offset;
    }
    return { value, offset };
  }
  if (majorType === 7) {
    if (additionalInfo === 20) return { value: false, offset };
    if (additionalInfo === 21) return { value: true, offset };
    if (additionalInfo === 22) return { value: null, offset };
  }

  throw new Error('Unsupported CBOR type');
};

const decodeAttestationAuthData = (attestationObject) => {
  const decoded = readCbor(attestationObject).value;
  const authData = decoded?.authData;
  if (!Buffer.isBuffer(authData) || authData.length < 55) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid passkey attestation data');
  }

  const rpIdHash = authData.subarray(0, 32);
  const flags = authData.readUInt8(32);
  const signCount = authData.readUInt32BE(33);
  const credentialIdLength = authData.readUInt16BE(53);
  const credentialIdStart = 55;
  const credentialIdEnd = credentialIdStart + credentialIdLength;
  if (credentialIdLength <= 0 || authData.length <= credentialIdEnd) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid passkey credential data');
  }

  return {
    rpIdHash,
    userPresent: Boolean(flags & 0x01),
    userVerified: Boolean(flags & 0x04),
    signCount,
    credentialId: authData.subarray(credentialIdStart, credentialIdEnd),
    credentialPublicKey: authData.subarray(credentialIdEnd),
  };
};

const decodeAssertionAuthData = (authenticatorData) => {
  if (!Buffer.isBuffer(authenticatorData) || authenticatorData.length < 37) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid passkey authenticator data');
  }
  return {
    rpIdHash: authenticatorData.subarray(0, 32),
    userPresent: Boolean(authenticatorData.readUInt8(32) & 0x01),
    userVerified: Boolean(authenticatorData.readUInt8(32) & 0x04),
    signCount: authenticatorData.readUInt32BE(33),
  };
};

const cosePublicKeyToKeyObject = (cosePublicKey) => {
  const key = readCbor(cosePublicKey).value;
  const kty = key['1'];
  const alg = key['3'];

  if (kty === 2 && alg === -7) {
    return crypto.createPublicKey({
      key: {
        kty: 'EC',
        crv: 'P-256',
        x: base64urlEncode(key['-2']),
        y: base64urlEncode(key['-3']),
      },
      format: 'jwk',
    });
  }

  if (kty === 3 && alg === -257) {
    return crypto.createPublicKey({
      key: {
        kty: 'RSA',
        n: base64urlEncode(key['-1']),
        e: base64urlEncode(key['-2']),
      },
      format: 'jwk',
    });
  }

  throw new ApiError(httpStatus.BAD_REQUEST, 'Unsupported passkey public key');
};

const findUserByMfaLoginToken = async (mfaToken) => {
  const user = await User.findOne({
    'customFields.security.mfa.loginChallenge.token': mfaToken,
  });
  if (!user) throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid MFA challenge');
  return user;
};

const getActiveLoginChallenge = (mfa) => {
  const challenge = mfa.loginChallenge;
  if (!challenge?.token || !challenge?.createdAt) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid MFA challenge');
  }
  if (Date.now() - new Date(challenge.createdAt).getTime() > MFA_LOGIN_CHALLENGE_TTL_MS) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'MFA challenge has expired');
  }
  return challenge;
};

const getMfaMethods = ({ authenticator, passkeys }) => ({
  authenticator: Boolean(authenticator.enabled && authenticator.secret),
  passkey: passkeys.length > 0,
});

const toBase32 = (buffer) => {
  let bits = '';
  for (const byte of buffer) bits += byte.toString(2).padStart(8, '0');
  let output = '';
  for (let index = 0; index < bits.length; index += 5) {
    const chunk = bits.slice(index, index + 5).padEnd(5, '0');
    output += BASE32_ALPHABET[parseInt(chunk, 2)];
  }
  return output;
};

const fromBase32 = (value) => {
  const cleaned = String(value || '').replace(/=+$/g, '').replace(/\s+/g, '').toUpperCase();
  let bits = '';
  for (const char of cleaned) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error('Invalid base32 secret');
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
};

const generateTotp = (secret, timeStep = Math.floor(Date.now() / 30000)) => {
  const key = fromBase32(secret);
  const counter = Buffer.alloc(8);
  counter.writeUInt32BE(Math.floor(timeStep / 0x100000000), 0);
  counter.writeUInt32BE(timeStep >>> 0, 4);
  const hmac = crypto.createHmac('sha1', key).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 1000000).padStart(6, '0');
};

const verifyTotp = ({ secret, code, window = 1 }) => {
  const normalizedCode = String(code || '').replace(/\D/g, '').slice(0, 6);
  if (normalizedCode.length !== 6) return false;
  const currentStep = Math.floor(Date.now() / 30000);
  for (let offset = -window; offset <= window; offset += 1) {
    if (generateTotp(secret, currentStep + offset) === normalizedCode) {
      return true;
    }
  }
  return false;
};

const getSecurityState = (user) => {
  const customFields = user?.customFields && typeof user.customFields === 'object' ? user.customFields : {};
  const security = customFields.security && typeof customFields.security === 'object' ? customFields.security : {};
  const mfa = security.mfa && typeof security.mfa === 'object' ? security.mfa : {};
  const authenticator = mfa.authenticator && typeof mfa.authenticator === 'object' ? mfa.authenticator : {};
  const passkeys = Array.isArray(mfa.passkeys) ? mfa.passkeys : [];
  return { customFields, security, mfa, authenticator, passkeys };
};

const saveSecurityState = async (user, nextSecurity) => {
  const customFields = user?.customFields && typeof user.customFields === 'object' ? { ...user.customFields } : {};
  customFields.security = nextSecurity;
  user.customFields = customFields;
  user.markModified('customFields');
  await user.save();
  return user;
};

const getMfaOverview = (user) => {
  const { authenticator, passkeys } = getSecurityState(user);
  return {
    authenticator: {
      enabled: Boolean(authenticator.enabled),
      verifiedAt: authenticator.verifiedAt || null,
      pending: Boolean(authenticator.pendingSecret && !authenticator.enabled),
    },
    passkeys: {
      enabled: passkeys.length > 0,
      count: passkeys.length,
    },
  };
};

const setupAuthenticator = async (userId) => {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(httpStatus.NOT_FOUND, 'User not found');

  const secret = toBase32(crypto.randomBytes(20));
  const { security, mfa, authenticator } = getSecurityState(user);
  const nextSecurity = {
    ...security,
    mfa: {
      ...mfa,
      authenticator: {
        ...authenticator,
        pendingSecret: secret,
        pendingAt: new Date().toISOString(),
      },
    },
  };

  await saveSecurityState(user, nextSecurity);
  const accountLabel = encodeURIComponent(user.email || String(user._id));
  const issuer = encodeURIComponent(ISSUER);
  return {
    secret,
    otpauthUrl: `otpauth://totp/${issuer}:${accountLabel}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`,
  };
};

const verifyAuthenticator = async ({ userId, code }) => {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(httpStatus.NOT_FOUND, 'User not found');

  const { security, mfa, authenticator } = getSecurityState(user);
  const secret = authenticator.pendingSecret || authenticator.secret;
  if (!secret) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Authenticator setup has not been started');
  }
  if (!verifyTotp({ secret, code })) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid authenticator code');
  }

  const verifiedAt = new Date().toISOString();
  const nextSecurity = {
    ...security,
    mfa: {
      ...mfa,
      authenticator: {
        secret,
        enabled: true,
        verifiedAt,
        pendingSecret: null,
        pendingAt: null,
      },
    },
  };

  await saveSecurityState(user, nextSecurity);
  return { enabled: true, verifiedAt };
};

const setAuthenticatorEnabled = async ({ userId, enabled }) => {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(httpStatus.NOT_FOUND, 'User not found');

  const { security, mfa, authenticator } = getSecurityState(user);
  if (enabled && !authenticator.secret) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Authenticator must be verified before it can be enabled');
  }

  const nextSecurity = {
    ...security,
    mfa: {
      ...mfa,
      authenticator: {
        ...authenticator,
        enabled: Boolean(enabled),
      },
    },
  };
  await saveSecurityState(user, nextSecurity);
  return getMfaOverview(user);
};

const generatePasskeyRegistrationOptions = async (userId) => {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(httpStatus.NOT_FOUND, 'User not found');

  const rpId = resolveWebAuthnRpId();
  const origin = resolveWebAuthnOrigin();
  const challenge = base64urlEncode(crypto.randomBytes(32));
  const userIdBuffer = Buffer.from(String(user._id));
  const { security, mfa, passkeys } = getSecurityState(user);

  const nextSecurity = {
    ...security,
    mfa: {
      ...mfa,
      passkeyChallenge: {
        challenge,
        rpId,
        origin,
        createdAt: new Date().toISOString(),
      },
    },
  };

  await saveSecurityState(user, nextSecurity);

  return {
    publicKey: {
      rp: { name: ISSUER, id: rpId },
      user: {
        id: base64urlEncode(userIdBuffer),
        name: user.email || String(user._id),
        displayName:
          [user.firstname, user.lastname].filter(Boolean).join(' ') ||
          user.name ||
          user.email ||
          'Saby user',
      },
      challenge,
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      timeout: 60000,
      attestation: 'none',
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
      excludeCredentials: passkeys
        .filter((passkey) => passkey.credentialId)
        .map((passkey) => ({
          type: 'public-key',
          id: passkey.credentialId,
          transports: Array.isArray(passkey.transports) ? passkey.transports : undefined,
        })),
    },
  };
};

const verifyPasskeyRegistration = async ({ userId, credential }) => {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(httpStatus.NOT_FOUND, 'User not found');

  const { security, mfa, passkeys } = getSecurityState(user);
  const pending = mfa.passkeyChallenge;
  if (!pending?.challenge || !pending?.createdAt) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Passkey setup has not been started');
  }
  if (Date.now() - new Date(pending.createdAt).getTime() > PASSKEY_CHALLENGE_TTL_MS) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Passkey setup has expired');
  }

  let clientData;
  try {
    clientData = JSON.parse(base64urlDecode(credential?.response?.clientDataJSON).toString('utf8'));
  } catch (error) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid passkey client data');
  }
  if (clientData.type !== 'webauthn.create') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid passkey registration type');
  }
  if (clientData.challenge !== pending.challenge) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid passkey challenge');
  }
  if (clientData.origin !== pending.origin) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid passkey origin');
  }

  let authData;
  try {
    const attestationObject = base64urlDecode(credential?.response?.attestationObject);
    authData = decodeAttestationAuthData(attestationObject);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid passkey attestation data');
  }
  const expectedRpIdHash = crypto.createHash('sha256').update(pending.rpId).digest();
  if (!crypto.timingSafeEqual(authData.rpIdHash, expectedRpIdHash)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid passkey relying party');
  }
  if (!authData.userPresent) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Passkey user presence was not verified');
  }

  const credentialId = base64urlEncode(authData.credentialId);
  if (passkeys.some((passkey) => passkey.credentialId === credentialId)) {
    throw new ApiError(httpStatus.CONFLICT, 'This passkey is already registered');
  }

  const now = new Date().toISOString();
  const nextPasskeys = [
    ...passkeys,
    {
      id: crypto.randomUUID(),
      credentialId,
      publicKey: base64urlEncode(authData.credentialPublicKey),
      signCount: authData.signCount,
      transports: Array.isArray(credential?.response?.transports)
        ? credential.response.transports
        : [],
      authenticatorAttachment: credential?.authenticatorAttachment || null,
      userVerifiedAtRegistration: authData.userVerified,
      createdAt: now,
      lastUsedAt: null,
    },
  ];

  const nextSecurity = {
    ...security,
    mfa: {
      ...mfa,
      passkeyChallenge: null,
      passkeys: nextPasskeys,
    },
  };

  await saveSecurityState(user, nextSecurity);
  return {
    success: true,
    message: 'Passkey registered successfully',
    credentialId,
    passkeys: {
      enabled: true,
      count: nextPasskeys.length,
    },
  };
};

const createLoginChallenge = async (user) => {
  const { security, mfa, authenticator, passkeys } = getSecurityState(user);
  const methods = getMfaMethods({ authenticator, passkeys });
  if (!methods.authenticator && !methods.passkey) {
    return { required: false };
  }

  const token = base64urlEncode(crypto.randomBytes(32));
  const challenge = base64urlEncode(crypto.randomBytes(32));
  const rpId = resolveWebAuthnRpId();
  const origin = resolveWebAuthnOrigin();
  const nextSecurity = {
    ...security,
    mfa: {
      ...mfa,
      loginChallenge: {
        token,
        challenge,
        rpId,
        origin,
        createdAt: new Date().toISOString(),
      },
    },
  };

  await saveSecurityState(user, nextSecurity);
  return {
    required: true,
    mfaToken: token,
    methods,
    expiresIn: Math.floor(MFA_LOGIN_CHALLENGE_TTL_MS / 1000),
  };
};

const generatePasskeyAssertionOptions = async ({ mfaToken }) => {
  const user = await findUserByMfaLoginToken(mfaToken);
  const { mfa, passkeys } = getSecurityState(user);
  const challenge = getActiveLoginChallenge(mfa);
  if (passkeys.length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'No passkey is registered for this account');
  }

  return {
    publicKey: {
      challenge: challenge.challenge,
      rpId: challenge.rpId,
      timeout: 60000,
      userVerification: 'preferred',
      allowCredentials: passkeys.map((passkey) => ({
        type: 'public-key',
        id: passkey.credentialId,
        transports: Array.isArray(passkey.transports) ? passkey.transports : undefined,
      })),
    },
  };
};

const clearLoginChallenge = async (user, security, mfa) => {
  await saveSecurityState(user, {
    ...security,
    mfa: {
      ...mfa,
      loginChallenge: null,
    },
  });
};

const verifyPasskeyAssertion = async ({ mfaToken, credential }) => {
  const user = await findUserByMfaLoginToken(mfaToken);
  const { security, mfa, passkeys } = getSecurityState(user);
  const challenge = getActiveLoginChallenge(mfa);
  const credentialId = credential?.rawId || credential?.id;
  const passkeyIndex = passkeys.findIndex((passkey) => passkey.credentialId === credentialId);
  if (passkeyIndex === -1) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Passkey is not registered for this account');
  }

  let clientData;
  try {
    clientData = JSON.parse(base64urlDecode(credential?.response?.clientDataJSON).toString('utf8'));
  } catch (error) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid passkey client data');
  }
  if (clientData.type !== 'webauthn.get') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid passkey assertion type');
  }
  if (clientData.challenge !== challenge.challenge) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid passkey challenge');
  }
  if (clientData.origin !== challenge.origin) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid passkey origin');
  }

  let assertionData;
  try {
    const authenticatorData = base64urlDecode(credential?.response?.authenticatorData);
    assertionData = decodeAssertionAuthData(authenticatorData);
    const expectedRpIdHash = crypto.createHash('sha256').update(challenge.rpId).digest();
    if (!crypto.timingSafeEqual(assertionData.rpIdHash, expectedRpIdHash)) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid passkey relying party');
    }
    if (!assertionData.userPresent) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Passkey user presence was not verified');
    }

    const publicKey = cosePublicKeyToKeyObject(base64urlDecode(passkeys[passkeyIndex].publicKey));
    const signedPayload = Buffer.concat([
      authenticatorData,
      crypto.createHash('sha256').update(base64urlDecode(credential?.response?.clientDataJSON)).digest(),
    ]);
    const valid = crypto.verify(
      'sha256',
      signedPayload,
      publicKey,
      base64urlDecode(credential?.response?.signature)
    );
    if (!valid) throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid passkey signature');
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid passkey assertion data');
  }

  const nextPasskeys = passkeys.map((passkey, index) =>
    index === passkeyIndex
      ? {
          ...passkey,
          signCount: assertionData.signCount,
          lastUsedAt: new Date().toISOString(),
        }
      : passkey
  );

  await saveSecurityState(user, {
    ...security,
    mfa: {
      ...mfa,
      loginChallenge: null,
      passkeys: nextPasskeys,
    },
  });

  return user;
};

const verifyAuthenticatorLogin = async ({ mfaToken, code }) => {
  const user = await findUserByMfaLoginToken(mfaToken);
  const { security, mfa, authenticator } = getSecurityState(user);
  getActiveLoginChallenge(mfa);
  if (!authenticator.enabled || !authenticator.secret) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Authenticator MFA is not enabled');
  }
  if (!verifyTotp({ secret: authenticator.secret, code })) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid authenticator code');
  }

  await clearLoginChallenge(user, security, mfa);
  return user;
};

module.exports = {
  getMfaOverview,
  setupAuthenticator,
  verifyAuthenticator,
  setAuthenticatorEnabled,
  generatePasskeyRegistrationOptions,
  verifyPasskeyRegistration,
  createLoginChallenge,
  generatePasskeyAssertionOptions,
  verifyPasskeyAssertion,
  verifyAuthenticatorLogin,
  verifyTotp,
};
