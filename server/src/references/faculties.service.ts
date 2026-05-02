import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Faculty } from '../database/schemas';
import { CreateFacultyDto, FacultyDto, UpdateFacultyDto } from './dto';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class FacultiesService {
  constructor(
    @InjectModel(Faculty.name) private readonly facultyModel: Model<Faculty>,
  ) {}

  async findAll(): Promise<FacultyDto[]> {
    const faculties = await this.facultyModel
      .find()
      .populate('dean')
      .lean()
      .exec();
    return plainToInstance(FacultyDto, faculties, {
      excludeExtraneousValues: true,
    });
  }

  async create(createFacultyDto: CreateFacultyDto): Promise<string> {
    const created = new this.facultyModel(createFacultyDto);
    await created.save();
    return created._id.toString();
  }

  async update(
    id: string,
    updateFacultyDto: UpdateFacultyDto,
  ): Promise<string> {
    const faculty = await this.facultyModel
      .findByIdAndUpdate(id, updateFacultyDto, { new: true })
      .exec();
    if (!faculty) {
      throw new NotFoundException(`Faculty with ID ${id} not found`);
    }
    return faculty._id.toString();
  }

  async remove(id: string): Promise<void> {
    const result = await this.facultyModel.deleteOne({ _id: id }).exec();
    if (result.deletedCount === 0) {
      throw new NotFoundException(`Faculty with ID ${id} not found`);
    }
  }
}
