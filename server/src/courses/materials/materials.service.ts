import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, PaginateModel } from 'mongoose';
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
  transformToPaginatedDto,
} from '../../common/utils/transform.util';
import { toId } from '../../common/utils/to-id.util';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PaginatedDto } from '../../common/dto/paginated.dto';

@Injectable()
export class MaterialsService {
  constructor(
    @InjectModel(Material.name)
    private materialModel: PaginateModel<MaterialDocument>,
    @InjectModel(CourseAssignment.name)
    private courseAssignmentModel: Model<CourseAssignmentDocument>,
  ) {}

  async findMaterials(
    courseAssignmentId: string,
    pagination: PaginationDto,
  ): Promise<PaginatedDto<MaterialDto>> {
    const options = {
      page: pagination.page || 1,
      limit: pagination.limit || 10,
      populate: 'files',
      sort: { publishDate: -1 },
      lean: true,
    };

    const result = await this.materialModel.paginate(
      { courseAssignment: new Types.ObjectId(courseAssignmentId) },
      options,
    );

    return transformToPaginatedDto(MaterialDto, result);
  }

  private async validateOwnership(
    courseAssignmentId: string,
    userId: string,
    role: Role,
  ): Promise<void> {
    if (role === Role.ADMIN) return;

    const ca = await this.courseAssignmentModel
      .findById(courseAssignmentId)
      .lean()
      .exec();

    if (!ca) {
      throw new NotFoundException('Призначення курсу не знайдено');
    }

    if (toId(ca.teacher) !== userId) {
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
      files: fileIds?.map((id) => new Types.ObjectId(id)) ?? [],
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

    await this.validateOwnership(toId(material.courseAssignment), userId, role);

    const { fileIds, ...rest } = updateMaterialDto;
    const updateData: Record<string, unknown> = { ...rest };
    if (fileIds) {
      updateData.files = fileIds.map((fid) => new Types.ObjectId(fid));
    }

    const updated = (await this.materialModel
      .findByIdAndUpdate(id, { $set: updateData }, { returnDocument: 'after' })
      .populate('files')
      .lean()
      .exec()) as MaterialDocument | null;

    if (!updated) {
      throw new NotFoundException('Матеріал не знайдено');
    }

    return transformToDto(MaterialDto, updated);
  }

  async remove(id: string, userId: string, role: Role): Promise<MaterialDto> {
    const material = await this.materialModel
      .findById(id)
      .populate('files')
      .exec();

    if (!material) {
      throw new NotFoundException('Матеріал не знайдено');
    }

    await this.validateOwnership(toId(material.courseAssignment), userId, role);

    const dto = transformToDto(MaterialDto, material.toObject());
    await this.materialModel.findByIdAndDelete(id).exec();
    return dto;
  }
}
