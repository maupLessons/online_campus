import { ApiProperty } from '@nestjs/swagger';
import { Expose, Transform, Type } from 'class-transformer';
import { UserMinimalDto } from '../../users/dto/user.dto';

export class CourseAssignmentDto {
  @ApiProperty()
  @Expose()
  @Transform(({ obj }) => obj._id?.toString() || obj.id)
  id: string;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }) => obj.course?.name)
  courseName: string;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }) => obj.course?.code)
  courseCode: string;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }) => obj.course?.credits)
  credits: number;

  @ApiProperty({ type: () => UserMinimalDto, required: false })
  @Expose()
  @Type(() => UserMinimalDto)
  teacher?: UserMinimalDto;

  @ApiProperty({ required: false })
  @Expose()
  @Transform(({ obj }) => obj.group?.code)
  groupCode?: string;

  @ApiProperty({ required: false })
  @Expose()
  @Transform(({ obj }) => obj.group?.specialty?.name)
  groupSpecialty?: string;

  @ApiProperty()
  @Expose()
  academicYear: string;

  @ApiProperty()
  @Expose()
  semester: number;
}
