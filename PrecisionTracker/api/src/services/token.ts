import jwt from 'jsonwebtoken';
import config from '../config/env';
import type { User } from '../db/models/user';
import type { UserRole } from '../db/models/user';

export interface TokenPayload extends jwt.JwtPayload {
  sub: string;
  role: UserRole;
}

const ensurePayload = (payload: string | jwt.JwtPayload): TokenPayload => {
  if (typeof payload === 'string' || !payload.sub) {
    throw new Error('Invalid token payload');
  }

  return payload as TokenPayload;
};

export const createAccessToken = (user: User): string => {
  return jwt.sign(
    {
      sub: String(user.id),
      role: user.role
    },
    config.auth.jwtSecret,
    {
      expiresIn: config.auth.expiresIn,
      audience: config.auth.audience,
      issuer: config.auth.issuer
    }
  );
};

export const createRefreshToken = (user: User): string => {
  return jwt.sign(
    {
      sub: String(user.id),
      role: user.role
    },
    config.auth.jwtRefreshSecret,
    {
      expiresIn: config.auth.refreshExpiresIn,
      audience: config.auth.audience,
      issuer: config.auth.issuer
    }
  );
};

export const verifyAccessToken = (token: string): TokenPayload => {
  const payload = jwt.verify(token, config.auth.jwtSecret, {
    audience: config.auth.audience,
    issuer: config.auth.issuer
  });

  return ensurePayload(payload);
};

export const verifyRefreshToken = (token: string): TokenPayload => {
  const payload = jwt.verify(token, config.auth.jwtRefreshSecret, {
    audience: config.auth.audience,
    issuer: config.auth.issuer
  });

  return ensurePayload(payload);
};
