import type { User } from '../db/models/user';
import type { UserRole } from '../db/models/user';

declare global {
  namespace Express {
    interface AuthContext {
      userId: number;
      role: UserRole;
      token: string;
    }

    interface Request {
      auth?: AuthContext;
      currentUser?: User;
    }
  }
}

export {};
