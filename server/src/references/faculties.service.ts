import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Faculty } from './schemas';
import { CreateFacultyDto, FacultyDto, UpdateFacultyDto } from './dto';
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
export class FacultiesService {
  constructor(
    @InjectModel(Faculty.name) private readonly facultyModel: Model<Faculty>,
    private readonly referenceIntegrityService: ReferenceIntegrityService,
  ) {}

  async findAll(): Promise<FacultyDto[]> {
    const faculties = await this.facultyModel
      .find()
      .populate('dean')
      .lean()
      .exec();
    return transformToDtoArray(FacultyDto, faculties);
  }

  async findById(id: string): Promise<FacultyDto> {
    const objectId = toReferenceObjectId(id, 'faculty');
    const faculty = await this.facultyModel
      .findById(objectId)
      .populate('dean')
      .lean()
      .exec();

    if (!faculty) {
      throwReferenceNotFound('Faculty', id);
    }

    return transformToDto(FacultyDto, faculty);
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
    const objectId = toReferenceObjectId(id, 'faculty');
    const faculty = await this.facultyModel
      .findByIdAndUpdate(objectId, updateFacultyDto, {
        returnDocument: 'after',
      })
      .exec();
    if (!faculty) {
      throwReferenceNotFound('Faculty', id);
    }
    return faculty._id.toString();
  }

  async remove(id: string): Promise<void> {
    const objectId = toReferenceObjectId(id, 'faculty');
    const facultyExists = await this.facultyModel.exists({ _id: objectId });

    if (!facultyExists) {
      throwReferenceNotFound('Faculty', id);
    }

    await this.referenceIntegrityService.assertFacultyCanBeDeleted(objectId);

    const result = await this.facultyModel.deleteOne({ _id: objectId }).exec();
    if (result.deletedCount === 0) {
      throwReferenceNotFound('Faculty', id);
    }
  }
}
