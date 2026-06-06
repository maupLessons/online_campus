import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types, PaginateModel } from 'mongoose';
import { Material, MaterialDocument } from '../schemas';
import { CreateMaterialDto, UpdateMaterialDto, MaterialDto } from './dto';
import { Role } from '../../common/types/roles.enum';
import {
  transformToDto,
  transformToPaginatedDto,
} from '../../common/utils/transform.util';
import { toId } from '../../common/utils/to-id.util';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PaginatedDto } from '../../common/dto/paginated.dto';
import { FilesService } from '../../files/files.service';
import { CoursesService } from '../courses/courses.service';

@Injectable()
export class MaterialsService {
  constructor(
    @InjectModel(Material.name)
    private materialModel: PaginateModel<MaterialDocument>,
    private readonly filesService: FilesService,
    private readonly coursesService: CoursesService,
  ) {}

  async findMaterials(
    courseAssignmentId: string,
    pagination: PaginationDto,
    userId: string,
    role: Role,
  ): Promise<PaginatedDto<MaterialDto>> {
    await this.coursesService.assertCourseAssignmentAccess(
      courseAssignmentId,
      userId,
      role,
    );

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

  async create(
    courseAssignmentId: string,
    createMaterialDto: CreateMaterialDto,
    userId: string,
    role: Role,
  ): Promise<MaterialDto> {
    await this.coursesService.validateOwnership(
      courseAssignmentId,
      userId,
      role,
    );

    const { fileIds, ...rest } = createMaterialDto;
    await this.filesService.assertFilesCanBeAttached(fileIds, userId, role);

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

    await this.coursesService.validateOwnership(
      toId(material.courseAssignment),
      userId,
      role,
    );

    const { fileIds, ...rest } = updateMaterialDto;
    const updateData: Record<string, unknown> = { ...rest };
    if (fileIds) {
      await this.filesService.assertFilesCanBeAttached(fileIds, userId, role);
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

    await this.coursesService.validateOwnership(
      toId(material.courseAssignment),
      userId,
      role,
    );

    const dto = transformToDto(MaterialDto, material.toObject());
    await this.materialModel.findByIdAndDelete(id).exec();
    return dto;
  }
}
