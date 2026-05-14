import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Material,
  MaterialDocument,
  CourseAssignment,
  CourseAssignmentDocument,
} from '../schemas';
import { CreateMaterialDto, UpdateMaterialDto, MaterialDto } from './dto';
import { Role } from '../../common/types/roles.enum';
import {
  transformToDto,
  transformToDtoArray,
} from '../../common/utils/transform.util';

@Injectable()
export class MaterialsService {
  constructor(
    @InjectModel(Material.name) private materialModel: Model<MaterialDocument>,
    @InjectModel(CourseAssignment.name)
    private courseAssignmentModel: Model<CourseAssignmentDocument>,
  ) {}

  async findMaterials(courseAssignmentId: string): Promise<MaterialDto[]> {
    const materials = await this.materialModel
      .find({
        courseAssignment: new Types.ObjectId(courseAssignmentId),
      } as any)
      .populate('files')
      .lean()
      .exec();

    return transformToDtoArray(MaterialDto, materials as any[]);
  }

  private async validateOwnership(
    courseAssignmentId: string,
    userId: string,
    role: Role,
  ) {
    if (role === Role.ADMIN) return;

    const ca = await this.courseAssignmentModel
      .findById(courseAssignmentId)
      .lean()
      .exec();

    if (!ca) {
      throw new NotFoundException('Призначення курсу не знайдено');
    }

    if (ca.teacher?.toString() !== userId) {
      throw new ForbiddenException('Ви не є викладачем цього курсу');
    }
  }

  async create(
    courseAssignmentId: string,
    createMaterialDto: CreateMaterialDto,
    userId: string,
    role: Role,
  ): Promise<MaterialDto> {
    await this.validateOwnership(courseAssignmentId, userId, role);

    const { fileIds, ...rest } = createMaterialDto;

    const newMaterial = new this.materialModel({
      ...rest,
      courseAssignment: new Types.ObjectId(courseAssignmentId),
      files: fileIds ? fileIds.map((id) => new Types.ObjectId(id)) : [],
    });
    const saved = await newMaterial.save();
    const populated = await saved.populate('files');
    return transformToDto(MaterialDto, populated.toObject());
  }

  async update(
    id: string,
    updateMaterialDto: UpdateMaterialDto,
    userId: string,
    role: Role,
  ): Promise<MaterialDto> {
    const material = await this.materialModel.findById(id).lean().exec();
    if (!material) {
      throw new NotFoundException('Матеріал не знайдено');
    }

    await this.validateOwnership(
      material.courseAssignment?.toString() || '',
      userId,
      role,
    );

    const { fileIds, ...rest } = updateMaterialDto;
    const updateData: Record<string, unknown> = { ...rest };

    if (fileIds) {
      updateData.files = fileIds.map((fid) => new Types.ObjectId(fid));
    }

    const updated = await this.materialModel
      .findByIdAndUpdate(id, { $set: updateData }, { new: true })
      .populate('files')
      .lean()
      .exec();

    if (!updated) {
      throw new NotFoundException('Матеріал не знайдено');
    }
    return transformToDto(MaterialDto, updated);
  }

  async remove(id: string, userId: string, role: Role): Promise<void> {
    const material = await this.materialModel.findById(id).lean().exec();
    if (!material) {
      throw new NotFoundException('Матеріал не знайдено');
    }

    await this.validateOwnership(
      material.courseAssignment?.toString() || '',
      userId,
      role,
    );

    await this.materialModel.findByIdAndDelete(id).exec();
  }
}
