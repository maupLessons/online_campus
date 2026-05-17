import { Request } from 'express';
import { Role } from './roles.enum';

export interface RequestWithUser extends Request {
  user: {
    sub: string;
    login: string;
    role: Role;
  };
}
