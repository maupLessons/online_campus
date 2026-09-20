import { ScheduleEntryDto } from '../../schedule/dto';

/**
 * Port to ScheduleService (spec 02 §5.2a). The method is OPTIONAL: until plan 02
 * is implemented, it doesn't exist in ScheduleService, and calling it directly would break tsc/build.
 * `null` = no schedule snapshot → meta.scheduleUnavailable: true;
 * `[]` = a snapshot exists, no upcoming lessons → meta.scheduleUnavailable: false.
 */
export interface UpcomingLessonsPort {
  findUpcomingForAssignment?(
    assignmentId: string,
    limit?: number,
  ): Promise<ScheduleEntryDto[] | null>;
}
