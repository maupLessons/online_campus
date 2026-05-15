import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../common/types/roles.enum';
import { Expose, Transform, Type } from 'class-transformer';
import { User } from '../schemas';

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

class StudentProfileDto {
  @ApiProperty()
  @Expose()
  @Transform(({ obj }: { obj?: { group?: unknown } }) =>
    referenceToString(obj?.group),
  )
  group: string | null;

  @ApiProperty()
  @Expose()
  recordBookNumber: string;

  @ApiProperty()
  @Expose()
  year: number;
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

  @ApiProperty({ type: () => StudentProfileDto, required: false })
  @Expose()
  @Type(() => StudentProfileDto)
  studentProfile?: StudentProfileDto;

  @ApiProperty({ type: () => TeacherProfileDto, required: false })
  @Expose()
  @Type(() => TeacherProfileDto)
  teacherProfile?: TeacherProfileDto;

  @ApiProperty()
  @Expose()
  @Transform(({ value }) =>
    value instanceof Date ? value.toISOString() : value,
  )
  createdAt: string;

  @ApiProperty()
  @Expose()
  @Transform(({ value }) =>
    value instanceof Date ? value.toISOString() : value,
  )
  updatedAt: string;
}

export class UserMinimalDto {
  @ApiProperty()
  @Expose()
  @Transform(({ obj }) => obj._id?.toString() || obj.id)
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
