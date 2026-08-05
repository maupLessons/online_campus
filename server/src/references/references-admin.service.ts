import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, QueryFilter } from 'mongoose';
import { PaginatedDto } from '../common/dto/paginated.dto';
import {
  ClassroomDto,
  DepartmentDto,
  FacultyDto,
  GroupDto,
  ReferenceAdminQueryDto,
  SpecialtyDto,
} from './dto';
import { transformToDtoArray } from '../common/utils/transform.util';
import { Classroom, Department, Faculty, Group, Specialty } from './schemas';
import { ReferenceType } from './reference.types';
import type { ReferenceReadFilter } from './references-access.service';

export type ReferenceAdminRecord =
  ClassroomDto | DepartmentDto | FacultyDto | GroupDto | SpecialtyDto;

@Injectable()
export class ReferencesAdminService {
  constructor(
    @InjectModel(Faculty.name)
    private readonly facultyModel: Model<Faculty>,
    @InjectModel(Department.name)
    private readonly departmentModel: Model<Department>,
    @InjectModel(Specialty.name)
    private readonly specialtyModel: Model<Specialty>,
    @InjectModel(Group.name)
    private readonly groupModel: Model<Group>,
    @InjectModel(Classroom.name)
    private readonly classroomModel: Model<Classroom>,
  ) {}

  async findAll(
    type: ReferenceType,
    query: ReferenceAdminQueryDto,
    accessFilter: ReferenceReadFilter = {},
  ): Promise<PaginatedDto<ReferenceAdminRecord>> {
    switch (type) {
      case ReferenceType.FACULTIES:
        return this.findFaculties(query, accessFilter);
      case ReferenceType.DEPARTMENTS:
        return this.findDepartments(query, accessFilter);
      case ReferenceType.SPECIALTIES:
        return this.findSpecialties(query, accessFilter);
      case ReferenceType.GROUPS:
        return this.findGroups(query, accessFilter);
      case ReferenceType.CLASSROOMS:
        return this.findClassrooms(query, accessFilter);
    }
  }

  async getAll(
    type: ReferenceType,
    accessFilter: ReferenceReadFilter = {},
  ): Promise<ReferenceAdminRecord[]> {
    const page = await this.findAll(
      type,
      {
        page: 1,
        limit: 100,
        sortOrder: 'asc',
      },
      accessFilter,
    );
    if (page.totalDocs <= page.docs.length) {
      return page.docs;
    }

    const pages = [page.docs];
    for (
      let currentPage = 2;
      currentPage <= page.totalPages;
      currentPage += 1
    ) {
      const next = await this.findAll(
        type,
        {
          page: currentPage,
          limit: 100,
          sortOrder: 'asc',
        },
        accessFilter,
      );
      pages.push(next.docs);
    }
    return pages.flat();
  }

  private async findFaculties(
    query: ReferenceAdminQueryDto,
    accessFilter: ReferenceReadFilter,
  ): Promise<PaginatedDto<FacultyDto>> {
    const filter = this.combineFilters(
      accessFilter,
      query.search ? { name: this.searchRegex(query.search) } : {},
    );
    const { page, limit, skip, sort } = this.pagination(query);
    const [documents, totalDocs] = await Promise.all([
      this.facultyModel
        .find(filter as QueryFilter<Faculty>)
        .populate('dean')
        .sort({ name: sort })
        .skip(skip)
        .limit(limit)
        .collation({ locale: 'uk', strength: 2 })
        .lean()
        .exec(),
      this.facultyModel.countDocuments(filter as QueryFilter<Faculty>).exec(),
    ]);
    return this.page(
      transformToDtoArray(FacultyDto, documents),
      totalDocs,
      page,
      limit,
    );
  }

  private async findDepartments(
    query: ReferenceAdminQueryDto,
    accessFilter: ReferenceReadFilter,
  ): Promise<PaginatedDto<DepartmentDto>> {
    const filter = this.combineFilters(
      accessFilter,
      query.search ? { name: this.searchRegex(query.search) } : {},
    );
    const { page, limit, skip, sort } = this.pagination(query);
    const [documents, totalDocs] = await Promise.all([
      this.departmentModel
        .find(filter as QueryFilter<Department>)
        .populate({ path: 'faculty', populate: { path: 'dean' } })
        .populate('head')
        .sort({ name: sort })
        .skip(skip)
        .limit(limit)
        .collation({ locale: 'uk', strength: 2 })
        .lean()
        .exec(),
      this.departmentModel
        .countDocuments(filter as QueryFilter<Department>)
        .exec(),
    ]);
    return this.page(
      transformToDtoArray(DepartmentDto, documents),
      totalDocs,
      page,
      limit,
    );
  }

  private async findSpecialties(
    query: ReferenceAdminQueryDto,
    accessFilter: ReferenceReadFilter,
  ): Promise<PaginatedDto<SpecialtyDto>> {
    const filter = this.combineFilters(
      accessFilter,
      query.search
        ? {
            $or: [
              { name: this.searchRegex(query.search) },
              { code: this.searchRegex(query.search) },
            ],
          }
        : {},
    );
    const { page, limit, skip, sort } = this.pagination(query);
    const [documents, totalDocs] = await Promise.all([
      this.specialtyModel
        .find(filter as QueryFilter<Specialty>)
        .sort({ code: sort })
        .skip(skip)
        .limit(limit)
        .collation({ locale: 'uk', strength: 2 })
        .lean()
        .exec(),
      this.specialtyModel
        .countDocuments(filter as QueryFilter<Specialty>)
        .exec(),
    ]);
    return this.page(
      transformToDtoArray(SpecialtyDto, documents),
      totalDocs,
      page,
      limit,
    );
  }

  private async findGroups(
    query: ReferenceAdminQueryDto,
    accessFilter: ReferenceReadFilter,
  ): Promise<PaginatedDto<GroupDto>> {
    const filter = this.combineFilters(
      accessFilter,
      query.search ? { code: this.searchRegex(query.search) } : {},
    );
    const { page, limit, skip, sort } = this.pagination(query);
    const [documents, totalDocs] = await Promise.all([
      this.groupModel
        .find(filter as QueryFilter<Group>)
        .populate('specialty')
        .populate('curator')
        .sort({ code: sort })
        .skip(skip)
        .limit(limit)
        .collation({ locale: 'uk', strength: 2 })
        .lean()
        .exec(),
      this.groupModel.countDocuments(filter as QueryFilter<Group>).exec(),
    ]);
    return this.page(
      transformToDtoArray(GroupDto, documents),
      totalDocs,
      page,
      limit,
    );
  }

  private async findClassrooms(
    query: ReferenceAdminQueryDto,
    accessFilter: ReferenceReadFilter,
  ): Promise<PaginatedDto<ClassroomDto>> {
    const filter = this.combineFilters(
      accessFilter,
      query.search
        ? {
            $or: [
              { building: this.searchRegex(query.search) },
              { roomNumber: this.searchRegex(query.search) },
              { type: this.searchRegex(query.search) },
            ],
          }
        : {},
    );
    const { page, limit, skip, sort } = this.pagination(query);
    const [documents, totalDocs] = await Promise.all([
      this.classroomModel
        .find(filter as QueryFilter<Classroom>)
        .sort({ building: sort, roomNumber: sort })
        .skip(skip)
        .limit(limit)
        .collation({ locale: 'uk', strength: 2 })
        .lean()
        .exec(),
      this.classroomModel
        .countDocuments(filter as QueryFilter<Classroom>)
        .exec(),
    ]);
    return this.page(
      transformToDtoArray(ClassroomDto, documents),
      totalDocs,
      page,
      limit,
    );
  }

  private pagination(query: ReferenceAdminQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    return {
      page,
      limit,
      skip: (page - 1) * limit,
      sort: query.sortOrder === 'desc' ? (-1 as const) : (1 as const),
    };
  }

  private page<T>(
    docs: T[],
    totalDocs: number,
    page: number,
    limit: number,
  ): PaginatedDto<T> {
    const totalPages = Math.max(1, Math.ceil(totalDocs / limit));
    return {
      docs,
      totalDocs,
      limit,
      page,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
      nextPage: page < totalPages ? page + 1 : undefined,
      prevPage: page > 1 ? page - 1 : undefined,
    };
  }

  private searchRegex(value: string): RegExp {
    return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  }

  private combineFilters(
    ...filters: ReferenceReadFilter[]
  ): ReferenceReadFilter {
    const activeFilters = filters.filter(
      (filter) => Object.keys(filter).length > 0,
    );
    if (activeFilters.length === 0) {
      return {};
    }
    if (activeFilters.length === 1) {
      return activeFilters[0];
    }
    return { $and: activeFilters };
  }
}
