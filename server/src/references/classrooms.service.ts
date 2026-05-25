import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Classroom } from './schemas';
import { ClassroomDto, CreateClassroomDto, UpdateClassroomDto } from './dto';
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
export class ClassroomsService {
  constructor(
    @InjectModel(Classroom.name)
    private readonly classroomModel: Model<Classroom>,
    private readonly referenceIntegrityService: ReferenceIntegrityService,
  ) {}

  async findAll(query: {
    type?: string;
    building?: string;
  }): Promise<ClassroomDto[]> {
    const classrooms = await this.classroomModel.find(query).lean().exec();
    return transformToDtoArray(ClassroomDto, classrooms);
  }

  async findById(id: string): Promise<ClassroomDto> {
    const objectId = toReferenceObjectId(id, 'classroom');
    const classroom = await this.classroomModel
      .findById(objectId)
      .lean()
      .exec();

    if (!classroom) {
      throwReferenceNotFound('Classroom', id);
    }

    return transformToDto(ClassroomDto, classroom);
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
    const objectId = toReferenceObjectId(id, 'classroom');
    const classroom = await this.classroomModel
      .findByIdAndUpdate(objectId, updateClassroomDto, {
        returnDocument: 'after',
      })
      .lean()
      .exec();
    if (!classroom) {
      throwReferenceNotFound('Classroom', id);
    }
    return classroom._id.toString();
  }

  async remove(id: string): Promise<void> {
    const objectId = toReferenceObjectId(id, 'classroom');
    const classroomExists = await this.classroomModel.exists({ _id: objectId });

    if (!classroomExists) {
      throwReferenceNotFound('Classroom', id);
    }

    await this.referenceIntegrityService.assertClassroomCanBeDeleted(objectId);

    const result = await this.classroomModel
      .deleteOne({ _id: objectId })
      .exec();
    if (result.deletedCount === 0) {
      throwReferenceNotFound('Classroom', id);
    }
  }
}
