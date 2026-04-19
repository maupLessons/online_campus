import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import {
  scheduleEntries,
  courseAssignments,
  courses,
  groups,
  classrooms,
  studentProfiles,
  teacherProfiles,
} from '../common/mock-data';
import { ScheduleEntry } from '../common/types/entities';

@Injectable()
export class ScheduleService {
  private entries = [...scheduleEntries];

  findAll() {
    return this.entries.map((entry) => this.enrichEntry(entry));
  }

  findByGroup(groupId: string) {
    const caIds = courseAssignments
      .filter((ca) => ca.groupId === groupId)
      .map((ca) => ca.id);

    return this.entries
      .filter((e) => caIds.includes(e.courseAssignmentId))
      .map((entry) => this.enrichEntry(entry));
  }

  findByTeacher(teacherId: string) {
    const caIds = courseAssignments
      .filter((ca) => ca.teacherId === teacherId)
      .map((ca) => ca.id);

    return this.entries
      .filter((e) => caIds.includes(e.courseAssignmentId))
      .map((entry) => this.enrichEntry(entry));
  }

  findByStudent(studentId: string) {
    const profile = studentProfiles.find((p) => p.userId === studentId);
    if (!profile) return [];
    return this.findByGroup(profile.groupId);
  }

  findByDate(date: string) {
    return this.entries
      .filter((e) => e.date === date)
      .map((entry) => this.enrichEntry(entry));
  }

  create(dto: Omit<ScheduleEntry, 'id'>) {
    const conflicts = this.checkConflicts(dto);
    if (conflicts.length > 0) {
      throw new BadRequestException({
        message: 'Конфлікт розкладу',
        conflicts,
      });
    }

    const entry: ScheduleEntry = { id: `sch-${Date.now()}`, ...dto };
    this.entries.push(entry);
    return this.enrichEntry(entry);
  }

  update(id: string, dto: Partial<ScheduleEntry>) {
    const idx = this.entries.findIndex((e) => e.id === id);
    if (idx === -1) throw new NotFoundException('Запис розкладу не знайдено');

    this.entries[idx] = { ...this.entries[idx], ...dto };
    return this.enrichEntry(this.entries[idx]);
  }

  delete(id: string) {
    const idx = this.entries.findIndex((e) => e.id === id);
    if (idx === -1) throw new NotFoundException('Запис розкладу не знайдено');
    this.entries.splice(idx, 1);
    return { deleted: true };
  }

  private checkConflicts(dto: Omit<ScheduleEntry, 'id'>) {
    const conflicts: string[] = [];
    const ca = courseAssignments.find((c) => c.id === dto.courseAssignmentId);
    if (!ca) return conflicts;

    for (const entry of this.entries) {
      if (entry.date !== dto.date || entry.status === 'cancelled') continue;
      if (entry.startTime >= dto.endTime || entry.endTime <= dto.startTime)
        continue;

      const entryCa = courseAssignments.find(
        (c) => c.id === entry.courseAssignmentId,
      );
      if (!entryCa) continue;

      if (entryCa.teacherId === ca.teacherId) {
        conflicts.push(
          `Викладач зайнятий: ${entry.startTime}-${entry.endTime}`,
        );
      }
      if (dto.classroomId && entry.classroomId === dto.classroomId) {
        conflicts.push(
          `Аудиторія зайнята: ${entry.startTime}-${entry.endTime}`,
        );
      }
      if (entryCa.groupId === ca.groupId) {
        conflicts.push(`Група зайнята: ${entry.startTime}-${entry.endTime}`);
      }
    }

    return conflicts;
  }

  private enrichEntry(entry: ScheduleEntry) {
    const ca = courseAssignments.find((c) => c.id === entry.courseAssignmentId);
    const course = ca ? courses.find((c) => c.id === ca.courseId) : null;
    const group = ca ? groups.find((g) => g.id === ca.groupId) : null;
    const classroom = entry.classroomId
      ? classrooms.find((r) => r.id === entry.classroomId)
      : null;

    return {
      ...entry,
      courseName: course?.name,
      courseCode: course?.code,
      groupCode: group?.code,
      teacherId: ca?.teacherId,
      classroom: classroom
        ? `${classroom.building}, ауд. ${classroom.roomNumber}`
        : 'Онлайн',
    };
  }
}
