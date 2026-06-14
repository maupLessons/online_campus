import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Group } from './schemas';
import { CreateGroupDto } from './dto';
import { GroupDto } from './dto';
import { UpdateGroupDto } from './dto';
import {
  transformToDto,
  transformToDtoArray,
} from '../common/utils/transform.util';
import { ReferenceIntegrityService } from './reference-integrity.service';
import {
  throwReferenceNotFound,
  toReferenceObjectId,
} from './reference-errors';
import { ReferenceRelationsService } from './reference-relations.service';
import { executeReferenceWrite } from './reference-write.util';

@Injectable()
export class GroupsService {
  constructor(
    @InjectModel(Group.name) private readonly groupModel: Model<Group>,
    private readonly referenceIntegrityService: ReferenceIntegrityService,
    private readonly referenceRelationsService: ReferenceRelationsService,
  ) {}

  async findAll(query: { course?: number }): Promise<GroupDto[]> {
    const groups = await this.groupModel
      .find(query)
      .populate('specialty')
      .populate('curator')
      .lean() // Return plain JavaScript objects
      .exec();
    return transformToDtoArray(GroupDto, groups);
  }

  async findById(id: string): Promise<GroupDto> {
    const objectId = toReferenceObjectId(id, 'group');
    const group = await this.groupModel
      .findById(objectId)
      .populate('specialty')
      .populate('curator')
      .lean() // Return plain JavaScript objects
      .exec();
    if (!group) {
      throwReferenceNotFound('Group', id);
    }
    return transformToDto(GroupDto, group);
  }

  async create(createGroupDto: CreateGroupDto): Promise<string> {
    await this.referenceRelationsService.assertGroupCurator(
      createGroupDto.curator,
    );
    return executeReferenceWrite(async () => {
      const createdGroup = new this.groupModel(createGroupDto);
      await createdGroup.save();
      return createdGroup._id.toString();
    }, 'Group');
  }

  async update(id: string, updateGroupDto: UpdateGroupDto): Promise<string> {
    await this.referenceRelationsService.assertGroupCurator(
      updateGroupDto.curator,
    );
    const objectId = toReferenceObjectId(id, 'group');
    const group = await executeReferenceWrite(
      () =>
        this.groupModel
          .findByIdAndUpdate(objectId, updateGroupDto, {
            returnDocument: 'after',
            runValidators: true,
          })
          .exec(),
      'Group',
    );
    if (!group) {
      throwReferenceNotFound('Group', id);
    }
    return group._id.toString();
  }

  async remove(id: string): Promise<void> {
    const objectId = toReferenceObjectId(id, 'group');
    const groupExists = await this.groupModel.exists({ _id: objectId });

    if (!groupExists) {
      throwReferenceNotFound('Group', id);
    }

    await this.referenceIntegrityService.assertGroupCanBeDeleted(objectId);

    const result = await this.groupModel.deleteOne({ _id: objectId }).exec();
    if (result.deletedCount === 0) {
      throwReferenceNotFound('Group', id);
    }
  }
}
