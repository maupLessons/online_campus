import { Injectable, NotFoundException } from '@nestjs/common';
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

@Injectable()
export class GroupsService {
  constructor(
    @InjectModel(Group.name) private readonly groupModel: Model<Group>,
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
    const group = await this.groupModel
      .findById(id)
      .populate('specialty')
      .populate('curator')
      .lean() // Return plain JavaScript objects
      .exec();
    if (!group) {
      throw new NotFoundException(`Group with ID ${id} not found`);
    }
    return transformToDto(GroupDto, group);
  }

  async create(createGroupDto: CreateGroupDto): Promise<string> {
    const createdGroup = new this.groupModel(createGroupDto);
    await createdGroup.save();
    return createdGroup._id.toString();
  }

  async update(id: string, updateGroupDto: UpdateGroupDto): Promise<string> {
    const group = await this.groupModel
      .findByIdAndUpdate(id, updateGroupDto, { new: true })
      .exec();
    if (!group) {
      throw new NotFoundException(`Group with ID ${id} not found`);
    }
    return group._id.toString();
  }

  async remove(id: string): Promise<void> {
    const result = await this.groupModel.deleteOne({ _id: id }).exec();
    if (result.deletedCount === 0) {
      throw new NotFoundException(`Group with ID ${id} not found`);
    }
  }
}
