import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { MaterialsService } from './materials.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../../auth/roles.guard';
import { Role } from '../../common/types/roles.enum';
import { ApiTags, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { CreateMaterialDto, UpdateMaterialDto, MaterialDto } from './dto';

@ApiTags('courses')
@ApiBearerAuth()
@Controller('courses/:courseAssignmentId/materials')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MaterialsController {
  constructor(private materialsService: MaterialsService) {}

  @Get()
  @ApiResponse({ type: [MaterialDto] })
  async getMaterials(@Param('courseAssignmentId') caId: string) {
    return this.materialsService.findMaterials(caId);
  }

  @Post()
  @Roles(Role.TEACHER, Role.ADMIN)
  @ApiResponse({ type: MaterialDto })
  async createMaterial(
    @Param('courseAssignmentId') caId: string,
    @Body() createMaterialDto: CreateMaterialDto,
    @Request() req: any,
  ) {
    const { sub, role } = req.user;
    return this.materialsService.create(caId, createMaterialDto, sub, role);
  }

  @Put(':id')
  @Roles(Role.TEACHER, Role.ADMIN)
  @ApiResponse({ type: MaterialDto })
  async updateMaterial(
    @Param('id') id: string,
    @Body() updateMaterialDto: UpdateMaterialDto,
    @Request() req: any,
  ) {
    const { sub, role } = req.user;
    return this.materialsService.update(id, updateMaterialDto, sub, role);
  }

  @Delete(':id')
  @Roles(Role.TEACHER, Role.ADMIN)
  @ApiResponse({ type: MaterialDto })
  async removeMaterial(
    @Param('id') id: string,
    @Request() req: any,
  ): Promise<MaterialDto> {
    const { sub, role } = req.user;
    return this.materialsService.remove(id, sub, role);
  }
}
