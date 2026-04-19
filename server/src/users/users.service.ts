import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../database/schemas';
import { Role } from '../common/types/roles.enum';
import { UserDto } from './dto/user.dto';

function mapToDto(user: User): UserDto {
  return {
    id: user._id.toString(),
    login: user.login,
    role: user.role,
    email: user.email,
    phone: user.phone,
    firstName: user.firstName,
    lastName: user.lastName,
    middleName: user.middleName,
    avatarUrl: user.avatarUrl,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    studentProfile: user.studentProfile
      ? {
          recordBookNumber: user.studentProfile.recordBookNumber,
          year: user.studentProfile.year,
        }
      : undefined,
    teacherProfile: user.teacherProfile
      ? {
          position: user.teacherProfile.position,
        }
      : undefined,
  };
}

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}

  async findAll(role?: Role): Promise<UserDto[]> {
    const users = await this.userModel
      .find(role ? { role } : {})
      .select('-passwordHash')
      .exec();

    return users.map(mapToDto);
  }

  async findOne(id: string): Promise<UserDto> {
    const user = await this.userModel
      .findById(id)
      .select('-passwordHash')
      .populate('studentProfile.group')
      .populate({
        path: 'teacherProfile.department',
        populate: { path: 'faculty' },
      })
      .exec();

    if (!user) {
      throw new NotFoundException('Користувача не знайдено');
    }

    return mapToDto(user);
  }

  async findByName(query: string): Promise<UserDto[]> {
    const q = new RegExp(query, 'i');
    const users = await this.userModel
      .find({ $or: [{ firstName: q }, { lastName: q }, { middleName: q }] })
      .select('-passwordHash')
      .exec();

    return users.map(mapToDto);
  }

  async getStudentsByGroup(groupId: string): Promise<UserDto[]> {
    const filter = { 'studentProfile.group': groupId } as Record<
      string,
      unknown
    >;
    const users = await this.userModel
      .find(filter)
      .select('-passwordHash')
      .exec();

    return users.map(mapToDto);
  }

  async getTeachersByDepartment(departmentId: string): Promise<UserDto[]> {
    const filter = { 'teacherProfile.department': departmentId } as Record<
      string,
      unknown
    >;
    const users = await this.userModel
      .find(filter)
      .select('-passwordHash')
      .exec();

    return users.map(mapToDto);
  }
}
