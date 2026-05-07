import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Specialty } from './schemas';
import { CreateSpecialtyDto, SpecialtyDto, UpdateSpecialtyDto } from './dto';
import { transformToDtoArray } from '../common/utils/transform.util';

@Injectable()
export class SpecialtiesService {
  constructor(
    @InjectModel(Specialty.name)
    private readonly specialtyModel: Model<Specialty>,
  ) {}

  async findAll(): Promise<SpecialtyDto[]> {
    const specialties = await this.specialtyModel.find().lean().exec();
    return transformToDtoArray(SpecialtyDto, specialties);
  }

  async create(createSpecialtyDto: CreateSpecialtyDto): Promise<string> {
    const created = new this.specialtyModel(createSpecialtyDto);
    await created.save();
    return created._id.toString();
  }

  async update(
    id: string,
    updateSpecialtyDto: UpdateSpecialtyDto,
  ): Promise<string> {
    const specialty = await this.specialtyModel
      .findByIdAndUpdate(id, updateSpecialtyDto, { new: true })
      .exec();
    if (!specialty) {
      throw new NotFoundException(`Specialty with ID ${id} not found`);
    }
    return specialty._id.toString();
  }

  async remove(id: string): Promise<void> {
    const result = await this.specialtyModel.deleteOne({ _id: id }).exec();
    if (result.deletedCount === 0) {
      throw new NotFoundException(`Specialty with ID ${id} not found`);
    }
  }
}
