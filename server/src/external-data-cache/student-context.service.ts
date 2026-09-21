import { Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { UsersService } from '../users/users.service';

export type StudentContext = {
  userId: string;
  studentProfileId: string;
  externalStudentId: string;
};

@Injectable()
export class StudentContextService {
  constructor(private readonly usersService: UsersService) {}

  /** `null` — немає активного профілю або він без `externalStudentId` (спека §5 п.1). */
  async resolveStudentContext(
    user: AuthenticatedUser,
  ): Promise<StudentContext | null> {
    const profile = await this.usersService.getActiveStudentProfile(user.sub);
    const externalStudentId = profile?.externalStudentId?.trim();
    if (!profile || !externalStudentId) {
      return null;
    }
    return {
      userId: user.sub,
      studentProfileId: profile._id.toString(),
      externalStudentId,
    };
  }
}
