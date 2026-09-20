import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ScheduleEntryDto } from '../../../schedule/dto';
import { CourseAssignmentSource, CourseResourceType } from '../../schemas';

export class CardCourseDto {
  @ApiProperty() id: string;
  @ApiProperty() code: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional() description?: string;
  @ApiProperty() credits: number;
  @ApiPropertyOptional({
    description: 'лише для тих, хто має canEditMoodleUrl (§4.3)',
  })
  externalSubjectId?: string;
  @ApiPropertyOptional() moodleUrl?: string;
  @ApiProperty() department: { id: string; name: string };
}

export class CardResourceDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty({ enum: CourseResourceType }) type: CourseResourceType;
  @ApiProperty() url: string;
  @ApiProperty() addedAt: string;
}

export class CourseAssignmentCardDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: CourseAssignmentSource }) source: CourseAssignmentSource;
  @ApiProperty({ type: CardCourseDto }) course: CardCourseDto;
  @ApiProperty() group: { id: string; code: string };
  @ApiProperty({ nullable: true }) teacher: {
    id: string;
    fullName: string;
  } | null;
  @ApiProperty() term: { id: string; academicYear: string; termNumber: number };
  @ApiPropertyOptional() curriculumSemester?: number;
  @ApiProperty({ type: [CardResourceDto] }) resources: CardResourceDto[];
  @ApiProperty({ type: [ScheduleEntryDto] })
  upcomingLessons: ScheduleEntryDto[];
  @ApiProperty() moodleHref: string;
  @ApiProperty() canEditResources: boolean;
  @ApiProperty() canEditMoodleUrl: boolean;
  @ApiProperty() meta: { scheduleUnavailable: boolean };
}
