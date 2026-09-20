import { Request } from 'express';
import { Role } from './roles.enum';

export interface AuthenticatedUser {
  sub: string;
  login: string;
  role: Role;
  activeStudentProfileId?: string;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}
