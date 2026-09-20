import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, PaginateModel, Types } from 'mongoose';
import { StudentProfile, User, UserDocument } from './schemas';
import { Role } from '../common/types/roles.enum';
import { UserDto } from './dto/user.dto';
import {
  transformToDto,
  transformToDtoArray,
  transformToDtoForRole,
  transformToPaginatedDto,
} from '../common/utils/transform.util';
import { PaginationDto } from '../common/dto/pagination.dto';
import { PaginatedDto } from '../common/dto/paginated.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangeUserRoleDto } from './dto/change-user-role.dto';
import { StudentProfileInputDto } from './dto/student-profile-input.dto';
import type { UserStatus } from './dto/user-query.dto';
import { toId } from '../common/utils/to-id.util';
import { DomainAuditContext } from '../audit-log/audit-context';
import { AUDIT_ACTIONS } from '../audit-log/audit-actions';
import { AcademicAccessService } from '../common/access/academic-access.service';
import { AuthenticatedUser } from '../common/types/authenticated-request';

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

export type ActiveStudentProfile = Omit<StudentProfile, 'group'> & {
  group: { _id: Types.ObjectId; code: string; specialty?: unknown };
};

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: PaginateModel<UserDocument>,
    private readonly academicAccessService: AcademicAccessService,
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

  async rotateRefreshTokenHash(
    userId: string,
    currentHash: string,
    nextHash: string,
  ): Promise<boolean> {
    const result = await this.userModel
      .updateOne(
        { _id: userId, refreshTokenHashes: currentHash },
        { $set: { 'refreshTokenHashes.$': nextHash } },
      )
      .exec();
    return result.modifiedCount === 1;
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
      .populate('studentProfiles.group')
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
    activeStudentProfileId: string | null;
  } | null> {
    const user = await this.userModel
      .findById(id)
      .select('login role status activeStudentProfileId')
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
      activeStudentProfileId: user.activeStudentProfileId
        ? toId(user.activeStudentProfileId)
        : null,
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
      studentProfiles,
      externalTeacherId,
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

    let builtStudentProfiles: StudentProfile[] | undefined;
    let activeStudentProfileId: Types.ObjectId | undefined;
    if (rest.role === Role.STUDENT) {
      builtStudentProfiles = this.buildStudentProfiles(studentProfiles);
      activeStudentProfileId = builtStudentProfiles[0]._id;
      await this.assertProfilesAvailable(undefined, builtStudentProfiles);
    }

    const teacherProfile =
      rest.role === Role.TEACHER && departmentId && position
        ? {
            department: departmentId,
            position,
            externalTeacherId: normalizeOptionalExternalId(externalTeacherId),
          }
        : undefined;

    const newUser = new this.userModel({
      login,
      email,
      passwordHash,
      studentProfiles: builtStudentProfiles,
      activeStudentProfileId,
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
    audit?: DomainAuditContext,
  ): Promise<UserDto> {
    const {
      login,
      email,
      password,
      studentProfiles,
      activeStudentProfileId,
      externalTeacherId,
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
    const statusChanged =
      rest.status !== undefined && rest.status !== existingUser.status;

    if (roleChanged && actorId === id) {
      throw new ForbiddenException('Неможливо змінити власну роль');
    }
    if (statusChanged && rest.status === 'blocked' && actorId === id) {
      throw new ForbiddenException('Неможливо заблокувати власний акаунт');
    }
    if (statusChanged && rest.status === 'blocked') {
      await this.assertAnotherActiveAdminExists(existingUser, id);
    }

    if (roleChanged) {
      const roleUpdate = await this.createRoleUpdateOperation(
        id,
        {
          role,
          studentProfiles,
          externalTeacherId,
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

      const hasTeacherProfileUpdates =
        departmentId !== undefined ||
        position !== undefined ||
        externalTeacherId !== undefined;

      if (existingUser.role === Role.STUDENT && studentProfiles !== undefined) {
        const existingProfiles = existingUser.toObject().studentProfiles ?? [];
        const built = this.mergeStudentProfiles(
          existingProfiles,
          studentProfiles,
        );
        await this.assertProfilesAvailable(id, built);
        updateData.studentProfiles = built;
        updateData.activeStudentProfileId = this.resolveNextActiveProfileId(
          built,
          activeStudentProfileId,
          existingUser.activeStudentProfileId,
        );
      } else if (
        existingUser.role === Role.STUDENT &&
        activeStudentProfileId !== undefined
      ) {
        const selected = existingUser.studentProfiles?.find(
          (p) =>
            p._id.toString() === activeStudentProfileId &&
            p.status === 'active',
        );
        if (!selected) {
          throw new BadRequestException(
            'activeStudentProfileId має відповідати активному профілю в studentProfiles',
          );
        }
        updateData.activeStudentProfileId = selected._id;
      } else if (
        existingUser.role === Role.TEACHER &&
        hasTeacherProfileUpdates
      ) {
        updateData.teacherProfile = {
          department: departmentId ?? existingUser.teacherProfile?.department,
          position: position ?? existingUser.teacherProfile?.position,
          externalTeacherId:
            externalTeacherId !== undefined
              ? normalizeOptionalExternalId(externalTeacherId)
              : existingUser.teacherProfile?.externalTeacherId,
        };
      }
    }

    const updateOperation: RoleUpdateOperation = { $set: updateData };
    if (Object.keys(unsetData).length > 0) {
      updateOperation.$unset = unsetData;
    }

    const updatedUser = await this.userModel
      .findByIdAndUpdate(id, updateOperation, {
        returnDocument: 'after',
        runValidators: true,
      })
      .lean()
      .exec();

    if (!updatedUser) {
      throw new NotFoundException('Користувача не знайдено');
    }

    if (
      roleChanged ||
      password ||
      (statusChanged && updatedUser.status === 'blocked')
    ) {
      await this.removeAllRefreshTokenHashes(id);
    }

    await this.recordUserSecurityChanges(existingUser, updatedUser, id, audit);
    return transformToDto(UserDto, updatedUser);
  }

  async changeRole(
    id: string,
    changeUserRoleDto: ChangeUserRoleDto,
    actorId?: string,
    audit?: DomainAuditContext,
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
      .findByIdAndUpdate(id, roleUpdate, {
        returnDocument: 'after',
        runValidators: true,
      })
      .lean()
      .exec();

    if (!updatedUser) {
      throw new NotFoundException('Користувача не знайдено');
    }

    if (roleChanged) {
      await this.removeAllRefreshTokenHashes(id);
    }

    await audit?.record({
      action: AUDIT_ACTIONS.USER_ROLE_CHANGE,
      targetEntity: 'user',
      targetId: id,
      details: {
        targetLogin: updatedUser.login,
        before: { role: existingUser.role },
        after: { role: updatedUser.role },
        changed: roleChanged,
        sessionsRevoked: roleChanged,
      },
    });

    return transformToDto(UserDto, updatedUser);
  }

  async toggleBlock(
    id: string,
    actorId?: string,
    audit?: DomainAuditContext,
  ): Promise<UserDto> {
    if (actorId === id) {
      throw new ForbiddenException('Неможливо заблокувати власний акаунт');
    }

    const user = await this.userModel.findById(id).lean().exec();
    if (!user) throw new NotFoundException('Користувача не знайдено');

    const newStatus = user.status === 'active' ? 'blocked' : 'active';
    if (newStatus === 'blocked') {
      await this.assertAnotherActiveAdminExists(user, id);
    }
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
      .findByIdAndUpdate(id, statusUpdate, {
        returnDocument: 'after',
        runValidators: true,
      })
      .lean()
      .exec();

    if (!updated) throw new NotFoundException('Користувача не знайдено');

    await audit?.record({
      action: AUDIT_ACTIONS.USER_STATUS_CHANGE,
      targetEntity: 'user',
      targetId: id,
      details: {
        targetLogin: updated.login,
        before: { status: user.status },
        after: { status: updated.status },
        sessionsRevoked: newStatus === 'blocked',
      },
    });

    return transformToDto(UserDto, updated);
  }

  async findOne(id: string, requester?: AuthenticatedUser): Promise<UserDto> {
    const scopeFilter = requester
      ? await this.academicAccessService.buildVisibleUserFilter(requester)
      : {};
    const user = await this.userModel
      .findOne({ $and: [{ _id: id }, scopeFilter] })
      .select('-passwordHash')
      .populate('studentProfiles.group')
      .populate({
        path: 'teacherProfile.department',
        populate: { path: 'faculty' },
      })
      .lean()
      .exec();

    if (!user) {
      throw new NotFoundException('Користувача не знайдено');
    }
    return transformToDtoForRole(UserDto, user, requester?.role);
  }

  async findAll(
    paginationDto: PaginationDto,
    filtersDto: {
      role?: Role;
      status?: UserStatus;
      search?: string;
    } = {},
    requester?: AuthenticatedUser,
  ): Promise<PaginatedDto<UserDto>> {
    const { page, limit } = paginationDto;
    const { role, status, search } = filtersDto;
    const options = {
      page,
      limit,
      sort: { createdAt: -1 },
      lean: true,
    };
    const filters: Array<Record<string, unknown>> = [];
    if (role) {
      filters.push({ role });
    }
    if (status) {
      filters.push({ status });
    }

    for (const token of normalizeSearchTokens(search)) {
      const pattern = new RegExp(escapeRegex(token), 'i');
      filters.push({
        $or: [
          { firstName: pattern },
          { lastName: pattern },
          { middleName: pattern },
        ],
      });
    }

    if (requester) {
      const scopeFilter =
        await this.academicAccessService.buildVisibleUserFilter(requester);
      if (Object.keys(scopeFilter).length > 0) {
        filters.push(scopeFilter);
      }
    }

    const query = filters.length > 0 ? { $and: filters } : {};
    const result = await this.userModel.paginate(query, options);
    return transformToPaginatedDto(UserDto, result, requester?.role);
  }

  async findByName(
    query: string,
    role?: Role,
    requester?: AuthenticatedUser,
  ): Promise<UserDto[]> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) return [];

    const q = new RegExp(escapeRegex(normalizedQuery.slice(0, 100)), 'i');
    const searchFilter: Record<string, unknown> = {
      $or: [{ firstName: q }, { lastName: q }, { middleName: q }],
    };

    if (role) {
      searchFilter.role = role;
    }
    const scopeFilter = requester
      ? await this.academicAccessService.buildVisibleUserFilter(requester)
      : {};

    const users = await this.userModel
      .find({ $and: [searchFilter, scopeFilter] })
      .select('-passwordHash')
      .lean()
      .exec();
    return transformToDtoArray(UserDto, users, requester?.role);
  }

  async getStudentsByGroup(
    groupId: string,
    requester?: AuthenticatedUser,
  ): Promise<UserDto[]> {
    if (
      requester &&
      !(await this.academicAccessService.canAccessGroup(groupId, requester))
    ) {
      throw new ForbiddenException('Немає доступу до цієї групи');
    }

    const filter = {
      role: Role.STUDENT,
      studentProfiles: {
        $elemMatch: { group: new Types.ObjectId(groupId), status: 'active' },
      },
    } as Record<string, unknown>;
    const users = await this.userModel
      .find(filter)
      .select('-passwordHash')
      .lean()
      .exec();
    return transformToDtoArray(UserDto, users, requester?.role);
  }

  async getTeachersByDepartment(
    departmentId: string,
    requester?: AuthenticatedUser,
  ): Promise<UserDto[]> {
    if (
      requester &&
      !(await this.academicAccessService.canAccessDepartment(
        departmentId,
        requester,
      ))
    ) {
      throw new ForbiddenException('Немає доступу до цієї кафедри');
    }

    const filter = { 'teacherProfile.department': departmentId } as Record<
      string,
      unknown
    >;
    const users = await this.userModel
      .find(filter)
      .select('-passwordHash')
      .lean()
      .exec();
    return transformToDtoArray(UserDto, users, requester?.role);
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

  async getActiveStudentProfile(
    userId: string,
  ): Promise<ActiveStudentProfile | null> {
    if (!isValidObjectId(userId)) return null;
    const user = await this.userModel
      .findById(userId)
      .select('role status studentProfiles activeStudentProfileId')
      .populate({ path: 'studentProfiles.group', select: 'code specialty' })
      .lean<{
        role: Role;
        status?: string;
        studentProfiles?: ActiveStudentProfile[];
        activeStudentProfileId?: Types.ObjectId | null;
      }>()
      .exec();
    // We check `status` here, not at the call sites: the previous schedule-reading implementation
    // filtered by `role: STUDENT, status: 'active'`, and this check must not be lost.
    if (!user || user.role !== Role.STUDENT || user.status !== 'active') {
      return null;
    }
    const profiles = (user.studentProfiles ?? []).filter(
      (p) => p.status === 'active',
    );
    const activeId = user.activeStudentProfileId?.toString();
    return (
      profiles.find((p) => p._id.toString() === activeId) ?? profiles[0] ?? null
    );
  }

  async getTeacherProfileRefs(userId: string): Promise<{
    externalTeacherId: string | null;
    department: Types.ObjectId | null;
  }> {
    const user = await this.userModel
      .findById(userId)
      .select('teacherProfile')
      .lean()
      .exec();
    return {
      externalTeacherId: user?.teacherProfile?.externalTeacherId ?? null,
      department:
        (user?.teacherProfile?.department as Types.ObjectId | undefined) ??
        null,
    };
  }

  private async createRoleUpdateOperation(
    id: string,
    dto: ChangeUserRoleDto,
    existingUser: UserRoleState,
  ): Promise<RoleUpdateOperation> {
    this.assertProfileFieldsMatchRole(dto);
    await this.assertCanChangeAdminRole(existingUser, dto.role, id);

    if (dto.role === Role.STUDENT) {
      const studentProfiles = this.buildStudentProfiles(dto.studentProfiles);
      await this.assertProfilesAvailable(id, studentProfiles);

      return {
        $set: {
          role: dto.role,
          studentProfiles,
          activeStudentProfileId: studentProfiles[0]._id,
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
          studentProfiles: [],
          activeStudentProfileId: null,
        },
      };
    }

    return {
      $set: {
        role: dto.role,
        studentProfiles: [],
        activeStudentProfileId: null,
      },
      $unset: {
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

    const hasStudentFields = dto.studentProfiles !== undefined;
    const hasTeacherFields =
      dto.departmentId !== undefined ||
      dto.position !== undefined ||
      dto.externalTeacherId !== undefined;

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

  private buildStudentProfiles(
    inputs: StudentProfileInputDto[] | undefined,
    existingProfiles: StudentProfile[] = [],
  ): StudentProfile[] {
    if (!inputs || inputs.length === 0) {
      throw new BadRequestException(
        'Для студента потрібен щонайменше один навчальний профіль',
      );
    }

    const existingByExternalId = new Map(
      existingProfiles.map((profile) => [profile.externalStudentId, profile]),
    );

    const ids = new Set<string>();
    const recordBooks = new Set<string>();
    return inputs.map((input) => {
      const externalStudentId = input.externalStudentId.trim();
      if (ids.has(externalStudentId)) {
        throw new BadRequestException('Дублікат externalStudentId у профілях');
      }
      ids.add(externalStudentId);

      const recordBookNumber = input.recordBookNumber.trim();
      // the multikey index deduplicates keys within a document and won't catch this duplicate
      if (recordBooks.has(recordBookNumber)) {
        throw new BadRequestException(
          'Дублікат номера залікової книжки у профілях',
        );
      }
      recordBooks.add(recordBookNumber);

      if (!isValidObjectId(input.groupId)) {
        throw new BadRequestException('Некоректний id групи');
      }

      const existing = existingByExternalId.get(externalStudentId);

      return {
        _id: existing?._id ?? new Types.ObjectId(),
        externalStudentId,
        group: new Types.ObjectId(input.groupId),
        recordBookNumber,
        year: input.year,
        studyForm: input.studyForm?.trim(),
        institute: input.institute?.trim(),
        specialty: input.specialty?.trim(),
        status: existing?.status ?? 'active',
        syncedAt: existing?.syncedAt ?? new Date(),
      };
    });
  }

  /**
   * UPSERT by externalStudentId for PATCH /users/:id (§4.3/§7.2): existing profiles
   * keep their _id/status/syncedAt and get updated fields from the payload; new ones
   * are added as active; ones missing from the payload are NOT deleted — they're switched
   * to inactive (history is preserved).
   */
  private mergeStudentProfiles(
    existingProfiles: StudentProfile[],
    inputs: StudentProfileInputDto[],
  ): StudentProfile[] {
    const submitted = this.buildStudentProfiles(inputs, existingProfiles);
    const submittedIds = new Set(
      submitted.map((profile) => profile.externalStudentId),
    );
    const carriedOver = existingProfiles
      .filter((profile) => !submittedIds.has(profile.externalStudentId))
      .map((profile) => ({
        ...profile,
        status: 'inactive' as const,
      }));

    return [...submitted, ...carriedOver];
  }

  private resolveNextActiveProfileId(
    profiles: StudentProfile[],
    requestedActiveProfileId: string | undefined,
    previousActiveProfileId: Types.ObjectId | null | undefined,
  ): Types.ObjectId | null {
    if (requestedActiveProfileId !== undefined) {
      const selected = profiles.find(
        (p) =>
          p._id.toString() === requestedActiveProfileId &&
          p.status === 'active',
      );
      if (!selected) {
        throw new BadRequestException(
          'activeStudentProfileId має відповідати активному профілю в studentProfiles',
        );
      }
      return selected._id;
    }

    const previousId = previousActiveProfileId?.toString();
    const stillActive = profiles.find(
      (p) => p._id.toString() === previousId && p.status === 'active',
    );
    if (stillActive) {
      return stillActive._id;
    }

    return profiles.find((p) => p.status === 'active')?._id ?? null;
  }

  private buildTeacherProfile(dto: ChangeUserRoleDto): {
    department: string;
    position: string;
    externalTeacherId?: string;
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

    const externalTeacherId = normalizeOptionalExternalId(
      dto.externalTeacherId,
    );

    return {
      department,
      position,
      ...(externalTeacherId ? { externalTeacherId } : {}),
    };
  }

  private async assertProfilesAvailable(
    excludeUserId: string | undefined,
    profiles: StudentProfile[],
  ): Promise<void> {
    const externalIds = profiles.map((p) => p.externalStudentId);
    const recordBookNumbers = profiles.map((p) => p.recordBookNumber);

    const duplicateUser = await this.userModel
      .findOne({
        ...(excludeUserId ? { _id: { $ne: excludeUserId } } : {}),
        $or: [
          { 'studentProfiles.externalStudentId': { $in: externalIds } },
          { 'studentProfiles.recordBookNumber': { $in: recordBookNumbers } },
        ],
      })
      .select('_id')
      .lean()
      .exec();

    if (duplicateUser) {
      throw new ConflictException(
        'Користувач з таким MAUP student_id або номером залікової книжки вже існує',
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

    await this.assertAnotherActiveAdminExists(existingUser, id);
  }

  private async assertAnotherActiveAdminExists(
    existingUser: UserRoleState,
    id: string,
  ): Promise<void> {
    if (existingUser.role !== Role.ADMIN || existingUser.status !== 'active') {
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
        'Неможливо змінити або заблокувати останнього активного адміністратора',
      );
    }
  }

  private async recordUserSecurityChanges(
    previous: { role: Role; status: string; login: string },
    next: { role: Role; status: string; login: string },
    targetId: string,
    audit?: DomainAuditContext,
  ): Promise<void> {
    if (previous.role !== next.role) {
      await audit?.record({
        action: AUDIT_ACTIONS.USER_ROLE_CHANGE,
        targetEntity: 'user',
        targetId,
        details: {
          targetLogin: next.login,
          before: { role: previous.role },
          after: { role: next.role },
          sessionsRevoked: true,
        },
      });
    }

    if (previous.status !== next.status) {
      await audit?.record({
        action: AUDIT_ACTIONS.USER_STATUS_CHANGE,
        targetEntity: 'user',
        targetId,
        details: {
          targetLogin: next.login,
          before: { status: previous.status },
          after: { status: next.status },
          sessionsRevoked: next.status === 'blocked',
        },
      });
    }
  }
}

function normalizeSearchTokens(value?: string): string[] {
  if (!value) {
    return [];
  }

  return value.trim().split(/\s+/).filter(Boolean).slice(0, 3);
}

function normalizeOptionalExternalId(value?: string): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}
