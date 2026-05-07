import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from './schemas';
import { Role } from '../common/types/roles.enum';
import { UserDto } from './dto/user.dto';

import {
  transformToDto,
  transformToDtoArray,
} from '../common/utils/transform.util';

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

    return transformToDtoArray(UserDto, users);
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

    return transformToDto(UserDto, user);
  }

  async findByName(query: string): Promise<UserDto[]> {
    const q = new RegExp(query, 'i');
    const users = await this.userModel
      .find({ $or: [{ firstName: q }, { lastName: q }, { middleName: q }] })
      .select('-passwordHash')
      .exec();

    return transformToDtoArray(UserDto, users);
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

    return transformToDtoArray(UserDto, users);
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

    return transformToDtoArray(UserDto, users);
  }
}
