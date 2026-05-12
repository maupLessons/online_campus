import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { PaginateModel } from 'mongoose';
import { User, UserDocument } from './schemas';
import { Role } from '../common/types/roles.enum';
import { UserDto } from './dto/user.dto';
import {
  transformToDto,
  transformToDtoArray,
  transformToPaginatedDto,
} from '../common/utils/transform.util';
import { PaginationDto } from '../common/dto/pagination.dto';
import { PaginatedDto } from '../common/dto/paginated.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: PaginateModel<UserDocument>,
  ) {}

  async findAll(
    paginationDto: PaginationDto,
    role?: Role,
  ): Promise<PaginatedDto<UserDto>> {
    const { page, limit } = paginationDto;
    const options = {
      page,
      limit,
    };
    const query = role ? { role } : {};
    const result = await this.userModel.paginate(query, options);
    return transformToPaginatedDto(UserDto, result);
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
