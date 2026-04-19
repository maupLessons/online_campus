import { Injectable } from '@nestjs/common';
import {
  groups,
  classrooms,
  departments,
  faculties,
} from '../common/mock-data';

@Injectable()
export class ReferencesService {
  getGroups() {
    return groups;
  }

  getClassrooms() {
    return classrooms;
  }

  getDepartments() {
    return departments;
  }

  getFaculties() {
    return faculties;
  }
}
