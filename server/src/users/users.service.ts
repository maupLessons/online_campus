import { Injectable, NotFoundException } from '@nestjs/common';
import {
  users,
  studentProfiles,
  teacherProfiles,
  groups,
  departments,
} from '../common/mock-data';
import { Role } from '../common/types/roles.enum';

@Injectable()
export class UsersService {
  findAll(role?: Role) {
    let result = users;
    if (role) {
      result = result.filter((u) => u.role === role);
    }
    return result.map(({ passwordHash, ...u }) => u);
  }

  findOne(id: string) {
    const user = users.find((u) => u.id === id);
    if (!user) throw new NotFoundException('Користувача не знайдено');

    const { passwordHash, ...userWithoutPassword } = user;
    const studentProfile = studentProfiles.find((p) => p.userId === id);
    const teacherProfile = teacherProfiles.find((p) => p.userId === id);

    let group = null;
    let department = null;

    if (studentProfile) {
      group = groups.find((g) => g.id === studentProfile.groupId);
    }
    if (teacherProfile) {
      department = departments.find(
        (d) => d.id === teacherProfile.departmentId,
      );
    }

    return {
      ...userWithoutPassword,
      studentProfile: studentProfile || undefined,
      teacherProfile: teacherProfile || undefined,
      group: group || undefined,
      department: department || undefined,
    };
  }

  findByName(query: string) {
    const q = query.toLowerCase();
    return users
      .filter(
        (u) =>
          u.firstName.toLowerCase().includes(q) ||
          u.lastName.toLowerCase().includes(q) ||
          (u.middleName && u.middleName.toLowerCase().includes(q)),
      )
      .map(({ passwordHash, ...u }) => u);
  }

  getStudentsByGroup(groupId: string) {
    const studentIds = studentProfiles
      .filter((p) => p.groupId === groupId)
      .map((p) => p.userId);

    return users
      .filter((u) => studentIds.includes(u.id))
      .map(({ passwordHash, ...u }) => {
        const profile = studentProfiles.find((p) => p.userId === u.id);
        return { ...u, studentProfile: profile };
      });
  }

  getTeachersByDepartment(departmentId: string) {
    const teacherIds = teacherProfiles
      .filter((p) => p.departmentId === departmentId)
      .map((p) => p.userId);

    return users
      .filter((u) => teacherIds.includes(u.id))
      .map(({ passwordHash, ...u }) => {
        const profile = teacherProfiles.find((p) => p.userId === u.id);
        return { ...u, teacherProfile: profile };
      });
  }
}
