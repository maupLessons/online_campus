import { Controller, Get, UseGuards } from '@nestjs/common';
import { ReferencesService } from './references.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('references')
@ApiBearerAuth()
@Controller('references')
@UseGuards(JwtAuthGuard)
export class ReferencesController {
  constructor(private referencesService: ReferencesService) {}

  @Get('groups')
  getGroups() {
    return this.referencesService.getGroups();
  }

  @Get('classrooms')
  getClassrooms() {
    return this.referencesService.getClassrooms();
  }

  @Get('departments')
  getDepartments() {
    return this.referencesService.getDepartments();
  }

  @Get('faculties')
  getFaculties() {
    return this.referencesService.getFaculties();
  }
}
