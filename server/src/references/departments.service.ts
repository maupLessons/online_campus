import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Department } from '../database/schemas';
import { CreateDepartmentDto } from './dto';
import { DepartmentDto } from './dto';
import { UpdateDepartmentDto } from './dto';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class DepartmentsService {
  constructor(
    @InjectModel(Department.name)
    private readonly departmentModel: Model<Department>,
  ) {}

  async findAll(): Promise<DepartmentDto[]> {
    const departments = await this.departmentModel
      .find()
      .populate({ path: 'faculty', populate: { path: 'dean' } })
      .populate('head')
      .lean()
      .exec();
    return plainToInstance(DepartmentDto, departments, {
      excludeExtraneousValues: true,
    });
  }

  async findById(id: string): Promise<DepartmentDto> {
    const department = await this.departmentModel
      .findById(id)
      .populate({ path: 'faculty', populate: { path: 'dean' } })
      .populate('head')
      .lean()
      .exec();
    if (!department) {
      throw new NotFoundException(`Department with ID ${id} not found`);
    }
    return plainToInstance(DepartmentDto, department, {
      excludeExtraneousValues: true,
    });
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
    const department = await this.departmentModel
      .findByIdAndUpdate(id, updateDepartmentDto, { new: true })
      .exec();
    if (!department) {
      throw new NotFoundException(`Department with ID ${id} not found`);
    }
    return department._id.toString();
  }

  async remove(id: string): Promise<void> {
    const result = await this.departmentModel.deleteOne({ _id: id }).exec();
    if (result.deletedCount === 0) {
      throw new NotFoundException(`Department with ID ${id} not found`);
    }
  }
}
