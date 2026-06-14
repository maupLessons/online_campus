import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Specialty } from './schemas';
import { CreateSpecialtyDto, SpecialtyDto, UpdateSpecialtyDto } from './dto';
import {
  transformToDto,
  transformToDtoArray,
} from '../common/utils/transform.util';
import { ReferenceIntegrityService } from './reference-integrity.service';
import {
  throwReferenceNotFound,
  toReferenceObjectId,
} from './reference-errors';
import { executeReferenceWrite } from './reference-write.util';

@Injectable()
export class SpecialtiesService {
  constructor(
    @InjectModel(Specialty.name)
    private readonly specialtyModel: Model<Specialty>,
    private readonly referenceIntegrityService: ReferenceIntegrityService,
  ) {}

  async findAll(): Promise<SpecialtyDto[]> {
    const specialties = await this.specialtyModel.find().lean().exec();
    return transformToDtoArray(SpecialtyDto, specialties);
  }

  async findById(id: string): Promise<SpecialtyDto> {
    const objectId = toReferenceObjectId(id, 'specialty');
    const specialty = await this.specialtyModel
      .findById(objectId)
      .lean()
      .exec();

    if (!specialty) {
      throwReferenceNotFound('Specialty', id);
    }

    return transformToDto(SpecialtyDto, specialty);
  }

  async create(createSpecialtyDto: CreateSpecialtyDto): Promise<string> {
    return executeReferenceWrite(async () => {
      const created = new this.specialtyModel(createSpecialtyDto);
      await created.save();
      return created._id.toString();
    }, 'Specialty');
  }

  async update(
    id: string,
    updateSpecialtyDto: UpdateSpecialtyDto,
  ): Promise<string> {
    const objectId = toReferenceObjectId(id, 'specialty');
    const specialty = await executeReferenceWrite(
      () =>
        this.specialtyModel
          .findByIdAndUpdate(objectId, updateSpecialtyDto, {
            returnDocument: 'after',
            runValidators: true,
          })
          .exec(),
      'Specialty',
    );
    if (!specialty) {
      throwReferenceNotFound('Specialty', id);
    }
    return specialty._id.toString();
  }

  async remove(id: string): Promise<void> {
    const objectId = toReferenceObjectId(id, 'specialty');
    const specialtyExists = await this.specialtyModel.exists({ _id: objectId });

    if (!specialtyExists) {
      throwReferenceNotFound('Specialty', id);
    }

    await this.referenceIntegrityService.assertSpecialtyCanBeDeleted(objectId);

    const result = await this.specialtyModel
      .deleteOne({ _id: objectId })
      .exec();
    if (result.deletedCount === 0) {
      throwReferenceNotFound('Specialty', id);
    }
  }
}
