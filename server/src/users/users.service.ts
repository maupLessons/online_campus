import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, PaginateModel } from 'mongoose';
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
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangeUserRoleDto } from './dto/change-user-role.dto';
import { toId } from '../common/utils/to-id.util';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

type UserRoleState = {
  role: Role;
  status: string;
};

type RoleUpdateOperation = {
  $set: Record<string, unknown>;
  $unset?: Record<string, ''>;
};

export type PasswordResetCandidate = {
  id: string;
  login: string;
  email: string;
  role: Role;
  status: string;
};

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: PaginateModel<UserDocument>,
  ) {}

  // =========================
  // Auth refresh sessions
  // =========================

  async addRefreshTokenHash(userId: string, tokenHash: string): Promise<void> {
    await this.userModel
      .updateOne(
        { _id: userId },
        {
          $addToSet: { refreshTokenHashes: tokenHash },
        },
      )
      .exec();
  }

  async removeRefreshTokenHash(
    userId: string,
    tokenHash: string,
  ): Promise<void> {
    await this.userModel
      .updateOne({ _id: userId }, { $pull: { refreshTokenHashes: tokenHash } })
      .exec();
  }

  async removeAllRefreshTokenHashes(userId: string): Promise<void> {
    await this.userModel
      .updateOne({ _id: userId }, { $set: { refreshTokenHashes: [] } })
      .exec();
  }

  async findByLogin(login: string): Promise<User | null> {
    return this.userModel
      .findOne({ login })
      .select('+passwordHash +refreshTokenHashes')
      .exec();
  }

  async findByIdWithPassword(id: string): Promise<User | null> {
    return this.userModel
      .findById(id)
      .select('+passwordHash +refreshTokenHashes')
      .exec();
  }

  async findAuthIdentityById(id: string): Promise<{
    id: string;
    login: string;
    role: Role;
    status: string;
  } | null> {
    const user = await this.userModel
      .findById(id)
      .select('login role status')
      .lean()
      .exec();

    if (!user) {
      return null;
    }

    return {
      id: toId(user._id),
      login: user.login,
      role: user.role,
      status: user.status,
    };
  }

  async updatePassword(id: string, passwordHash: string): Promise<void> {
    await this.userModel
      .updateOne(
        { _id: id },
        {
          $set: { passwordHash },
          $unset: {
            passwordResetTokenHash: '',
            passwordResetTokenExpiresAt: '',
          },
        },
      )
      .exec();
  }

  async findPasswordResetCandidate(
    identifier: string,
  ): Promise<PasswordResetCandidate | null> {
    const normalized = identifier.trim();
    if (!normalized) {
      return null;
    }

    const emailCandidate = normalized.toLowerCase();
    const user = await this.userModel
      .findOne({
        $or: [
          { login: normalized },
          { email: normalized },
          { email: emailCandidate },
        ],
      })
      .select('login email role status')
      .lean()
      .exec();

    if (!user) {
      return null;
    }

    return {
      id: toId(user._id),
      login: user.login,
      email: user.email,
      role: user.role,
      status: user.status,
    };
  }

  async setPasswordResetToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.userModel
      .updateOne(
        { _id: userId, status: 'active' },
        {
          $set: {
            passwordResetTokenHash: tokenHash,
            passwordResetTokenExpiresAt: expiresAt,
          },
        },
      )
      .exec();
  }

  async consumePasswordResetToken(
    tokenHash: string,
    passwordHash: string,
    now = new Date(),
  ): Promise<PasswordResetCandidate | null> {
    const user = await this.userModel
      .findOneAndUpdate(
        {
          passwordResetTokenHash: tokenHash,
          passwordResetTokenExpiresAt: { $gt: now },
          status: 'active',
        },
        {
          $set: {
            passwordHash,
            refreshTokenHashes: [],
          },
          $unset: {
            passwordResetTokenHash: '',
            passwordResetTokenExpiresAt: '',
          },
        },
        { returnDocument: 'after' },
      )
      .select('login email role status')
      .lean()
      .exec();

    if (!user) {
      return null;
    }

    return {
      id: toId(user._id),
      login: user.login,
      email: user.email,
      role: user.role,
      status: user.status,
    };
  }

  // =========================
  // Users management
  // =========================

  async create(createUserDto: CreateUserDto): Promise<UserDto> {
    const {
      login,
      email,
      password,
      groupId,
      recordBookNumber,
      year,
      departmentId,
      position,
      ...rest
    } = createUserDto;

    const existingUser = await this.userModel
      .findOne({ $or: [{ login }, { email }] })
      .lean()
      .exec();

    if (existingUser) {
      throw new ConflictException(
        'Користувач з таким логіном або ел.адресою вже існує',
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const studentProfile =
      rest.role === Role.STUDENT && groupId && recordBookNumber && year
        ? { group: groupId, recordBookNumber, year }
        : undefined;

    const teacherProfile =
      rest.role === Role.TEACHER && departmentId && position
        ? { department: departmentId, position }
        : undefined;

    const newUser = new this.userModel({
      login,
      email,
      passwordHash,
      studentProfile,
      teacherProfile,
      ...rest,
    });

    const savedUser = await newUser.save();
    return transformToDto(UserDto, savedUser.toObject());
  }

  async update(
    id: string,
    updateUserDto: UpdateUserDto,
    actorId?: string,
  ): Promise<UserDto> {
    const {
      login,
      email,
      password,
      groupId,
      recordBookNumber,
      year,
      departmentId,
      position,
      role,
      ...rest
    } = updateUserDto;

    const existingUser = await this.userModel.findById(id).exec();
    if (!existingUser) {
      throw new NotFoundException('Користувача не знайдено');
    }

    if (login || email) {
      const duplicateUser = await this.userModel
        .findOne({
          $or: [...(login ? [{ login }] : []), ...(email ? [{ email }] : [])],
          _id: { $ne: id },
        })
        .lean()
        .exec();

      if (duplicateUser) {
        throw new ConflictException(
          'Користувач з таким логіном або email вже існує',
        );
      }
    }

    const updateData: Record<string, unknown> = { ...rest };

    if (login) updateData.login = login;
    if (email) updateData.email = email;

    if (password) {
      updateData.passwordHash = await bcrypt.hash(password, 12);
    }

    const unsetData: Record<string, ''> = {};
    if (password) {
      unsetData.passwordResetTokenHash = '';
      unsetData.passwordResetTokenExpiresAt = '';
    }

    const roleChanged = role !== undefined && role !== existingUser.role;

    if (roleChanged && actorId === id) {
      throw new ForbiddenException('Неможливо змінити власну роль');
    }

    if (roleChanged) {
      const roleUpdate = await this.createRoleUpdateOperation(
        id,
        {
          role,
          groupId,
          recordBookNumber,
          year,
          departmentId,
          position,
        },
        existingUser,
      );

      Object.assign(updateData, roleUpdate.$set);
      if (roleUpdate.$unset) {
        Object.assign(unsetData, roleUpdate.$unset);
      }
    } else {
      if (role !== undefined) {
        updateData.role = role;
      }

      if (existingUser.role === Role.STUDENT) {
        updateData.studentProfile = {
          group: groupId ?? existingUser.studentProfile?.group,
          recordBookNumber:
            recordBookNumber ?? existingUser.studentProfile?.recordBookNumber,
          year: year !== undefined ? year : existingUser.studentProfile?.year,
        };
      } else if (existingUser.role === Role.TEACHER) {
        updateData.teacherProfile = {
          department: departmentId ?? existingUser.teacherProfile?.department,
          position: position ?? existingUser.teacherProfile?.position,
        };
      }
    }

    const updateOperation: RoleUpdateOperation = { $set: updateData };
    if (Object.keys(unsetData).length > 0) {
      updateOperation.$unset = unsetData;
    }

    const updatedUser = await this.userModel
      .findByIdAndUpdate(id, updateOperation, { returnDocument: 'after' })
      .lean()
      .exec();

    if (!updatedUser) {
      throw new NotFoundException('Користувача не знайдено');
    }

    if (roleChanged || password) {
      await this.removeAllRefreshTokenHashes(id);
    }

    return transformToDto(UserDto, updatedUser);
  }

  async changeRole(
    id: string,
    changeUserRoleDto: ChangeUserRoleDto,
    actorId?: string,
  ): Promise<UserDto> {
    this.assertValidUserId(id);

    if (actorId === id) {
      throw new ForbiddenException('Неможливо змінити власну роль');
    }

    const existingUser = (await this.userModel
      .findById(id)
      .select('role status')
      .lean()
      .exec()) as UserRoleState | null;

    if (!existingUser) {
      throw new NotFoundException('Користувача не знайдено');
    }

    const roleChanged = existingUser.role !== changeUserRoleDto.role;
    const roleUpdate = await this.createRoleUpdateOperation(
      id,
      changeUserRoleDto,
      existingUser,
    );

    const updatedUser = await this.userModel
      .findByIdAndUpdate(id, roleUpdate, { returnDocument: 'after' })
      .lean()
      .exec();

    if (!updatedUser) {
      throw new NotFoundException('Користувача не знайдено');
    }

    if (roleChanged) {
      await this.removeAllRefreshTokenHashes(id);
    }

    return transformToDto(UserDto, updatedUser);
  }

  async toggleBlock(id: string): Promise<UserDto> {
    const user = await this.userModel.findById(id).lean().exec();
    if (!user) throw new NotFoundException('Користувача не знайдено');

    const newStatus = user.status === 'active' ? 'blocked' : 'active';
    const statusUpdate =
      newStatus === 'blocked'
        ? {
            $set: {
              status: newStatus,
              refreshTokenHashes: [],
            },
            $unset: {
              passwordResetTokenHash: '',
              passwordResetTokenExpiresAt: '',
            },
          }
        : { $set: { status: newStatus } };

    const updated = await this.userModel
      .findByIdAndUpdate(id, statusUpdate, { returnDocument: 'after' })
      .lean()
      .exec();

    if (!updated) throw new NotFoundException('Користувача не знайдено');
    return transformToDto(UserDto, updated);
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
      .lean()
      .exec();

    if (!user) {
      throw new NotFoundException('Користувача не знайдено');
    }
    return transformToDto(UserDto, user);
  }

  async findAll(
    paginationDto: PaginationDto,
    role?: Role,
  ): Promise<PaginatedDto<UserDto>> {
    const { page, limit } = paginationDto;
    const options = {
      page,
      limit,
      sort: { createdAt: -1 },
      lean: true,
    };
    const query = role ? { role } : {};
    const result = await this.userModel.paginate(query, options);
    return transformToPaginatedDto(UserDto, result);
  }

  async findByName(query: string, role?: Role): Promise<UserDto[]> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) return [];

    const q = new RegExp(escapeRegex(normalizedQuery.slice(0, 100)), 'i');
    const filter: Record<string, unknown> = {
      $or: [{ firstName: q }, { lastName: q }, { middleName: q }],
    };

    if (role) {
      filter.role = role;
    }

    const users = await this.userModel
      .find(filter)
      .select('-passwordHash')
      .lean()
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
      .lean()
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
      .lean()
      .exec();
    return transformToDtoArray(UserDto, users);
  }

  async findActiveUserIdsByRoles(roles: Role[]): Promise<string[]> {
    if (roles.length === 0) {
      return [];
    }

    const users = await this.userModel
      .find({
        role: { $in: roles },
        status: 'active',
      })
      .select('_id')
      .lean()
      .exec();

    return users.map((user) => toId(user._id)).filter(Boolean);
  }

  private async createRoleUpdateOperation(
    id: string,
    dto: ChangeUserRoleDto,
    existingUser: UserRoleState,
  ): Promise<RoleUpdateOperation> {
    this.assertProfileFieldsMatchRole(dto);
    await this.assertCanChangeAdminRole(existingUser, dto.role, id);

    if (dto.role === Role.STUDENT) {
      const studentProfile = this.buildStudentProfile(dto);
      await this.assertRecordBookNumberAvailable(
        id,
        studentProfile.recordBookNumber,
      );

      return {
        $set: {
          role: dto.role,
          studentProfile,
        },
        $unset: {
          teacherProfile: '',
        },
      };
    }

    if (dto.role === Role.TEACHER) {
      return {
        $set: {
          role: dto.role,
          teacherProfile: this.buildTeacherProfile(dto),
        },
        $unset: {
          studentProfile: '',
        },
      };
    }

    return {
      $set: {
        role: dto.role,
      },
      $unset: {
        studentProfile: '',
        teacherProfile: '',
      },
    };
  }

  private assertValidUserId(id: string): void {
    if (!isValidObjectId(id)) {
      throw new BadRequestException('Некоректний id користувача');
    }
  }

  private assertProfileFieldsMatchRole(dto: ChangeUserRoleDto): void {
    if (!Object.values(Role).includes(dto.role)) {
      throw new BadRequestException('Некоректна роль користувача');
    }

    const hasStudentFields =
      dto.groupId !== undefined ||
      dto.recordBookNumber !== undefined ||
      dto.year !== undefined;
    const hasTeacherFields =
      dto.departmentId !== undefined || dto.position !== undefined;

    if (dto.role === Role.STUDENT && hasTeacherFields) {
      throw new BadRequestException(
        'Поля профілю викладача не можна передавати для ролі студента',
      );
    }

    if (dto.role === Role.TEACHER && hasStudentFields) {
      throw new BadRequestException(
        'Поля профілю студента не можна передавати для ролі викладача',
      );
    }

    if (
      dto.role !== Role.STUDENT &&
      dto.role !== Role.TEACHER &&
      (hasStudentFields || hasTeacherFields)
    ) {
      throw new BadRequestException(
        'Профільні поля дозволені лише для ролей студента або викладача',
      );
    }
  }

  private buildStudentProfile(dto: ChangeUserRoleDto): {
    group: string;
    recordBookNumber: string;
    year: number;
  } {
    const group = dto.groupId?.trim();
    const recordBookNumber = dto.recordBookNumber?.trim();
    const year = dto.year;

    if (
      !group ||
      !recordBookNumber ||
      typeof year !== 'number' ||
      !Number.isInteger(year) ||
      year < 1
    ) {
      throw new BadRequestException(
        'Для ролі студента потрібно передати groupId, recordBookNumber та year',
      );
    }

    if (!isValidObjectId(group)) {
      throw new BadRequestException('Некоректний id групи');
    }

    return {
      group,
      recordBookNumber,
      year,
    };
  }

  private buildTeacherProfile(dto: ChangeUserRoleDto): {
    department: string;
    position: string;
  } {
    const department = dto.departmentId?.trim();
    const position = dto.position?.trim();

    if (!department || !position) {
      throw new BadRequestException(
        'Для ролі викладача потрібно передати departmentId та position',
      );
    }

    if (!isValidObjectId(department)) {
      throw new BadRequestException('Некоректний id кафедри');
    }

    return {
      department,
      position,
    };
  }

  private async assertRecordBookNumberAvailable(
    id: string,
    recordBookNumber: string,
  ): Promise<void> {
    const duplicateUser = await this.userModel
      .findOne({
        'studentProfile.recordBookNumber': recordBookNumber,
        _id: { $ne: id },
      })
      .select('_id')
      .lean()
      .exec();

    if (duplicateUser) {
      throw new ConflictException(
        'Користувач з таким номером залікової книжки вже існує',
      );
    }
  }

  private async assertCanChangeAdminRole(
    existingUser: UserRoleState,
    nextRole: Role,
    id: string,
  ): Promise<void> {
    if (
      existingUser.role !== Role.ADMIN ||
      existingUser.status !== 'active' ||
      nextRole === Role.ADMIN
    ) {
      return;
    }

    const activeAdminsLeft = await this.userModel
      .countDocuments({
        role: Role.ADMIN,
        status: 'active',
        _id: { $ne: id },
      })
      .exec();

    if (activeAdminsLeft === 0) {
      throw new BadRequestException(
        'Неможливо змінити роль останнього активного адміністратора',
      );
    }
  }
}
