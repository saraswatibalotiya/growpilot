import type { BusinessCategory, UserStatus } from '../common/constants';

/** A user as the API returns it. The password hash is never included. */
export interface SafeUser {
  id: string;
  name: string;
  email: string;
  status: UserStatus;
}

export interface LoginUser extends SafeUser {
  passwordHash: string;
}

export interface UserIdRow {
  id: string;
}

export interface ActiveUserRow {
  id: string;
  status: UserStatus;
}

export interface StoredRefreshToken {
  id: string;
  userId: string;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface NewRefreshToken {
  id: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface CreatedBusiness {
  id: string;
  name: string;
  category: BusinessCategory;
}

export interface CreatedAccount {
  user: SafeUser;
  business: CreatedBusiness;
}

/** Response body of signup, login and refresh (login and signup add the user). */
export interface AuthTokens {
  accessToken: string;
  tokenType: 'Bearer';
  /** Access token lifetime in seconds. */
  expiresIn: number;
  refreshToken: string;
  /** Refresh token lifetime in seconds. */
  refreshExpiresIn: number;
}

export interface SignupResponse extends CreatedAccount, AuthTokens {}

export interface LoginResponse extends AuthTokens {
  user: SafeUser;
}

/** Claims the access token carries. */
export interface AccessTokenPayload {
  sub: string;
  exp: number;
}
