import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Classroom } from './schemas';
import { ClassroomDto, CreateClassroomDto, UpdateClassroomDto } from './dto';
import { transformToDtoArray } from '../common/utils/transform.util';

@Injectable()
export class ClassroomsService {
  constructor(
    @InjectModel(Classroom.name)
    private readonly classroomModel: Model<Classroom>,
  ) {}

  async findAll(query: {
    type?: string;
    building?: string;
  }): Promise<ClassroomDto[]> {
    const classrooms = await this.classroomModel.find(query).lean().exec();
    return transformToDtoArray(ClassroomDto, classrooms);
  }

  async create(createClassroomDto: CreateClassroomDto): Promise<string> {
    const created = new this.classroomModel(createClassroomDto);
    await created.save();
    return created._id.toString();
  }

  async update(
    id: string,
    updateClassroomDto: UpdateClassroomDto,
  ): Promise<string> {
    const classroom = await this.classroomModel
      .findByIdAndUpdate(id, updateClassroomDto, { new: true })
      .lean()
      .exec();
    if (!classroom) {
      throw new NotFoundException(`Classroom with ID ${id} not found`);
    }
    return classroom._id.toString();
  }

  async remove(id: string): Promise<void> {
    const result = await this.classroomModel.deleteOne({ _id: id }).exec();
    if (result.deletedCount === 0) {
      throw new NotFoundException(`Classroom with ID ${id} not found`);
    }
  }
}
