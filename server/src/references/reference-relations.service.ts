import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Role } from '../common/types/roles.enum';
import { User, UserDocument } from '../users/schemas';

@Injectable()
export class ReferenceRelationsService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async assertFacultyDean(deanId?: string | null): Promise<void> {
    if (!deanId) return;
    await this.assertActiveUserRole(deanId, [Role.DEAN], 'dean');
  }

  async assertDepartmentHead(headId?: string | null): Promise<void> {
    if (!headId) return;
    await this.assertActiveUserRole(
      headId,
      [Role.DEPARTMENT_HEAD],
      'department head',
    );
  }

  async assertGroupCurator(curatorId?: string | null): Promise<void> {
    if (!curatorId) return;
    await this.assertActiveUserRole(
      curatorId,
      [Role.TEACHER, Role.DEPARTMENT_HEAD, Role.DEAN],
      'group curator',
    );
  }

  private async assertActiveUserRole(
    userId: string,
    allowedRoles: Role[],
    relationName: string,
  ): Promise<void> {
    const user = await this.userModel
      .findById(new Types.ObjectId(userId))
      .select('role status')
      .lean()
      .exec();

    if (!user) {
      throw new BadRequestException(`Invalid ${relationName}: user not found`);
    }
    if (user.status !== 'active') {
      throw new BadRequestException(
        `Invalid ${relationName}: user is not active`,
      );
    }
    if (!allowedRoles.includes(user.role)) {
      throw new BadRequestException(
        `Invalid ${relationName}: user role must be ${allowedRoles.join(', ')}`,
      );
    }
  }
}
