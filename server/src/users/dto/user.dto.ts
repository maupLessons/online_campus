import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../common/types/roles.enum';
import { Expose, Transform, Type } from 'class-transformer';
import { User } from '../schemas';
import { toId } from '../../common/utils/to-id.util';

type MinimalUserLike = {
  _id?: unknown;
  id?: unknown;
};

function referenceToString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return value.toString();
  }

  if (typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = record._id;

  if (typeof id === 'string') {
    return id;
  }

  if (id && typeof id === 'object') {
    const toString = (id as { toString?: unknown }).toString;
    if (typeof toString === 'function') {
      return toString.call(id) as string;
    }
  }

  const toString = (value as { toString?: unknown }).toString;
  if (
    typeof toString === 'function' &&
    toString !== Object.prototype.toString
  ) {
    return toString.call(value) as string;
  }

  return null;
}

export class StudentProfileGroupDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty({ required: false })
  @Expose()
  code?: string;
}

export class StudentProfileDto {
  @ApiProperty()
  @Expose()
  @Transform(
    ({ obj }: { obj?: { _id?: unknown } }) => referenceToString(obj?._id) ?? '',
  )
  id: string;

  @ApiProperty({ type: () => StudentProfileGroupDto, nullable: true })
  @Expose()
  @Transform(({ obj }: { obj?: { group?: unknown } }) => {
    const g = obj?.group;
    if (!g) return null;
    if (typeof g === 'object' && 'code' in g) {
      const doc = g as { _id: unknown; code: string };
      return { id: referenceToString(doc._id), code: doc.code };
    }
    return { id: referenceToString(g) };
  })
  group: StudentProfileGroupDto | null;

  @ApiProperty()
  @Expose()
  recordBookNumber: string;

  @ApiProperty()
  @Expose()
  year: number;

  @ApiProperty({ required: false })
  @Expose()
  studyForm?: string;

  @ApiProperty({ required: false })
  @Expose()
  institute?: string;

  @ApiProperty({ required: false })
  @Expose()
  specialty?: string;

  @ApiProperty({ enum: ['active', 'inactive'] })
  @Expose()
  status: 'active' | 'inactive';

  @ApiProperty()
  @Expose()
  @Transform(({ value }: { value?: Date | string }) =>
    value instanceof Date ? value.toISOString() : value,
  )
  syncedAt: string;

  @ApiProperty({ required: false, description: 'Лише для admin' })
  @Expose({ groups: ['admin'] })
  externalStudentId?: string;
}

class TeacherProfileDto {
  @ApiProperty()
  @Expose()
  @Transform(({ obj }: { obj?: { department?: unknown } }) =>
    referenceToString(obj?.department),
  )
  department: string | null;

  @ApiProperty()
  @Expose()
  position: string;

  @ApiProperty({ required: false })
  @Expose({ groups: ['admin'] })
  externalTeacherId?: string;
}

export class UserDto {
  @ApiProperty()
  @Expose()
  @Transform(({ obj }: { obj: User }) => obj._id.toString())
  id: string;

  @ApiProperty()
  @Expose()
  login: string;

  @ApiProperty()
  @Expose()
  email: string;

  @ApiProperty({ enum: Role })
  @Expose()
  role: Role;

  @ApiProperty()
  @Expose()
  firstName: string;

  @ApiProperty()
  @Expose()
  lastName: string;

  @ApiProperty({ required: false })
  @Expose()
  middleName?: string;

  @ApiProperty({ required: false })
  @Expose()
  phone?: string;

  @ApiProperty({ required: false })
  @Expose()
  avatarUrl?: string;

  @ApiProperty()
  @Expose()
  status: string;

  @ApiProperty({ type: () => [StudentProfileDto] })
  @Expose()
  @Type(() => StudentProfileDto)
  studentProfiles: StudentProfileDto[];

  @ApiProperty({ nullable: true })
  @Expose()
  // `obj`, not `value`: class-transformer clones the raw ObjectId in the `value` field
  // through a new instance (generating a different id), so we read directly from the source.
  @Transform(({ obj }: { obj?: { activeStudentProfileId?: unknown } }) =>
    referenceToString(obj?.activeStudentProfileId),
  )
  activeStudentProfileId: string | null;

  @ApiProperty({ type: () => TeacherProfileDto, required: false })
  @Expose()
  @Type(() => TeacherProfileDto)
  teacherProfile?: TeacherProfileDto;

  @ApiProperty()
  @Expose()
  @Transform(({ value }: { value?: Date | string }) =>
    value instanceof Date ? value.toISOString() : value,
  )
  createdAt: string;

  @ApiProperty()
  @Expose()
  @Transform(({ value }: { value?: Date | string }) =>
    value instanceof Date ? value.toISOString() : value,
  )
  updatedAt: string;
}

export class UserMinimalDto {
  @ApiProperty()
  @Expose()
  @Transform(({ obj }: { obj: MinimalUserLike }) => toId(obj._id ?? obj.id))
  id: string;

  @ApiProperty()
  @Expose()
  firstName: string;

  @ApiProperty()
  @Expose()
  lastName: string;

  @ApiProperty({ required: false })
  @Expose()
  middleName?: string;

  @ApiProperty({ required: false })
  @Expose()
  avatarUrl?: string;

  @ApiProperty({ enum: Role })
  @Expose()
  role: Role;
}

export function pickActiveStudentProfile(
  user: Pick<UserDto, 'studentProfiles' | 'activeStudentProfileId'>,
): StudentProfileDto | null {
  const profiles = user.studentProfiles ?? [];
  const active = profiles.find(
    (p) => p.id === user.activeStudentProfileId && p.status === 'active',
  );
  return active ?? profiles.find((p) => p.status === 'active') ?? null;
}
