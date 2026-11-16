/** Shared by every place that signs or verifies a GrowPilot JWT, so the two sides can never drift apart. */
export const JWT_ALGORITHM = 'HS256';
export const JWT_ALGORITHMS = [JWT_ALGORITHM] as ['HS256'];
export const JWT_ISSUER = 'growpilot-api';
export const JWT_ACCESS_AUDIENCE = 'growpilot-web';
export const JWT_OAUTH_STATE_AUDIENCE = 'instagram-oauth-state';

export const BCRYPT_ROUNDS = 12;
/** bcrypt ignores everything after 72 bytes, so longer passwords are refused instead of silently truncated. */
export const MAX_PASSWORD_BYTES = 72;
export const MIN_JWT_SECRET_BYTES = 32;

export const ACCESS_TOKEN_TYPE = 'Bearer';
/** Seconds: default, minimum and maximum lifetimes. */
export const ACCESS_TTL = { env: 'JWT_ACCESS_TTL_SECONDS', fallback: 900, min: 60, max: 3600 } as const;
export const REFRESH_TTL = { env: 'JWT_REFRESH_TTL_SECONDS', fallback: 30 * 86_400, min: 3600, max: 90 * 86_400 } as const;
