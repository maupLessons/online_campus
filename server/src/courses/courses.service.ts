import { Injectable, NotFoundException } from '@nestjs/common';
import {
  courses,
  courseAssignments,
  groups,
  materials,
  assignments,
  submissions,
  grades,
  studentProfiles,
  teacherProfiles,
  users,
} from '../common/mock-data';

@Injectable()
export class CoursesService {
  // ============ COURSES ============

  findAllCourses() {
    return courses;
  }

  findCoursesByStudent(studentId: string) {
    const profile = studentProfiles.find((p) => p.userId === studentId);
    if (!profile) return [];

    const cas = courseAssignments.filter(
      (ca) => ca.groupId === profile.groupId,
    );
    return cas.map((ca) => {
      const course = courses.find((c) => c.id === ca.courseId);
      const teacher = users.find((u) => u.id === ca.teacherId);
      return {
        ...ca,
        courseName: course?.name,
        courseCode: course?.code,
        credits: course?.credits,
        teacherName: teacher
          ? `${teacher.lastName} ${teacher.firstName[0]}.${teacher.middleName ? ' ' + teacher.middleName[0] + '.' : ''}`
          : undefined,
      };
    });
  }

  findCoursesByTeacher(teacherId: string) {
    const cas = courseAssignments.filter((ca) => ca.teacherId === teacherId);
    return cas.map((ca) => {
      const course = courses.find((c) => c.id === ca.courseId);
      const group = groups.find((g) => g.id === ca.groupId);
      return {
        ...ca,
        courseName: course?.name,
        courseCode: course?.code,
        credits: course?.credits,
        groupCode: group?.code,
        groupSpecialty: group?.specialty,
      };
    });
  }

  // ============ MATERIALS ============

  findMaterials(courseAssignmentId: string) {
    return materials.filter((m) => m.courseAssignmentId === courseAssignmentId);
  }

  // ============ ASSIGNMENTS ============

  findAssignments(courseAssignmentId: string) {
    return assignments.filter(
      (a) => a.courseAssignmentId === courseAssignmentId,
    );
  }

  findAssignmentsByStudent(studentId: string) {
    const profile = studentProfiles.find((p) => p.userId === studentId);
    if (!profile) return [];

    const caIds = courseAssignments
      .filter((ca) => ca.groupId === profile.groupId)
      .map((ca) => ca.id);

    return assignments
      .filter((a) => caIds.includes(a.courseAssignmentId))
      .map((a) => {
        const ca = courseAssignments.find((c) => c.id === a.courseAssignmentId);
        const course = ca ? courses.find((c) => c.id === ca.courseId) : null;
        const sub = submissions.find(
          (s) => s.assignmentId === a.id && s.studentId === studentId,
        );
        return {
          ...a,
          courseName: course?.name,
          submission: sub || null,
        };
      });
  }

  // ============ SUBMISSIONS ============

  findSubmissions(assignmentId: string) {
    return submissions
      .filter((s) => s.assignmentId === assignmentId)
      .map((s) => {
        const student = users.find((u) => u.id === s.studentId);
        return {
          ...s,
          studentName: student
            ? `${student.lastName} ${student.firstName}`
            : undefined,
        };
      });
  }

  // ============ GRADES ============

  findGradesByStudent(studentId: string) {
    return grades
      .filter((g) => g.studentId === studentId)
      .map((g) => {
        const ca = courseAssignments.find((c) => c.id === g.courseAssignmentId);
        const course = ca ? courses.find((c) => c.id === ca.courseId) : null;
        return {
          ...g,
          courseName: course?.name,
          courseCode: course?.code,
        };
      });
  }

  findGradesByCourseAssignment(courseAssignmentId: string) {
    const ca = courseAssignments.find((c) => c.id === courseAssignmentId);
    if (!ca) return [];

    const studentIds = studentProfiles
      .filter((p) => p.groupId === ca.groupId)
      .map((p) => p.userId);

    return studentIds.map((sid) => {
      const student = users.find((u) => u.id === sid);
      const studentGrades = grades.filter(
        (g) =>
          g.studentId === sid && g.courseAssignmentId === courseAssignmentId,
      );
      return {
        studentId: sid,
        studentName: student
          ? `${student.lastName} ${student.firstName}`
          : undefined,
        grades: studentGrades,
      };
    });
  }
}
