import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Department } from './schemas';
import { CreateDepartmentDto } from './dto';
import { DepartmentDto } from './dto';
import { UpdateDepartmentDto } from './dto';
import {
  transformToDto,
  transformToDtoArray,
} from '../common/utils/transform.util';
import { ReferenceIntegrityService } from './reference-integrity.service';
import {
  throwReferenceNotFound,
  toReferenceObjectId,
} from './reference-errors';

@Injectable()
export class DepartmentsService {
  constructor(
    @InjectModel(Department.name)
    private readonly departmentModel: Model<Department>,
    private readonly referenceIntegrityService: ReferenceIntegrityService,
  ) {}

  async findAll(): Promise<DepartmentDto[]> {
    const departments = await this.departmentModel
      .find()
      .populate({ path: 'faculty', populate: { path: 'dean' } })
      .populate('head')
      .lean()
      .exec();
    return transformToDtoArray(DepartmentDto, departments);
  }

  async findById(id: string): Promise<DepartmentDto> {
    const objectId = toReferenceObjectId(id, 'department');
    const department = await this.departmentModel
      .findById(objectId)
      .populate({ path: 'faculty', populate: { path: 'dean' } })
      .populate('head')
      .lean()
      .exec();
    if (!department) {
      throwReferenceNotFound('Department', id);
    }
    return transformToDto(DepartmentDto, department);
  }

  async create(createDepartmentDto: CreateDepartmentDto): Promise<string> {
    const created = new this.departmentModel(createDepartmentDto);
    await created.save();
    return created._id.toString();
  }

  async update(
    id: string,
    updateDepartmentDto: UpdateDepartmentDto,
  ): Promise<string> {
    const objectId = toReferenceObjectId(id, 'department');
    const department = await this.departmentModel
      .findByIdAndUpdate(objectId, updateDepartmentDto, {
        returnDocument: 'after',
      })
      .exec();
    if (!department) {
      throwReferenceNotFound('Department', id);
    }
    return department._id.toString();
  }

  async remove(id: string): Promise<void> {
    const objectId = toReferenceObjectId(id, 'department');
    const departmentExists = await this.departmentModel.exists({
      _id: objectId,
    });

    if (!departmentExists) {
      throwReferenceNotFound('Department', id);
    }

    await this.referenceIntegrityService.assertDepartmentCanBeDeleted(objectId);

    const result = await this.departmentModel
      .deleteOne({ _id: objectId })
      .exec();
    if (result.deletedCount === 0) {
      throwReferenceNotFound('Department', id);
    }
  }
}
