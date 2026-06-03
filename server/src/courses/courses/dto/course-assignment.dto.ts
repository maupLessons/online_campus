import { ApiProperty } from '@nestjs/swagger';
import { Expose, Transform, Type } from 'class-transformer';
import { UserMinimalDto } from '../../../users/dto/user.dto';
import { CourseAssignment, CourseAssignmentSource } from '../../schemas';
import { toId } from '../../../common/utils/to-id.util';

export class CourseAssignmentDto {
  @ApiProperty()
  @Expose()
  @Transform(({ obj }: { obj: CourseAssignment }) => toId(obj))
  id: string;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }: { obj: CourseAssignment }) => obj.course?.name)
  courseName: string;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }: { obj: CourseAssignment }) => toId(obj.course))
  courseId: string;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }: { obj: CourseAssignment }) => obj.course?.code)
  courseCode: string;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }: { obj: CourseAssignment }) => obj.course?.credits)
  credits: number;

  @ApiProperty({ type: () => UserMinimalDto, required: false })
  @Expose()
  @Type(() => UserMinimalDto)
  teacher?: UserMinimalDto;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }: { obj: CourseAssignment }) => toId(obj.teacher))
  teacherId: string;

  @ApiProperty({ required: false })
  @Expose()
  @Transform(({ obj }: { obj: CourseAssignment }) => obj.group?.code)
  groupCode?: string;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }: { obj: CourseAssignment }) => toId(obj.group))
  groupId: string;

  @ApiProperty({ required: false })
  @Expose()
  @Transform(({ obj }: { obj: CourseAssignment }) => obj.group?.specialty?.name)
  groupSpecialty?: string;

  @ApiProperty()
  @Expose()
  academicYear: string;

  @ApiProperty()
  @Expose()
  semester: number;

  @ApiProperty({ enum: CourseAssignmentSource, required: false })
  @Expose()
  source?: CourseAssignmentSource;
}
