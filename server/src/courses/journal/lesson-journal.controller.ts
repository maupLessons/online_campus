import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../../auth/roles.guard';
import { PaginatedDto } from '../../common/dto/paginated.dto';
import { Role } from '../../common/types/roles.enum';
import { RequestWithUser } from '../../common/types/request-with-user.interface';
import {
  CreateLessonJournalEntryDto,
  LessonJournalEntryDto,
  LessonJournalQueryDto,
  UpdateLessonJournalEntryDto,
} from './dto';
import { LessonJournalService } from './lesson-journal.service';

@ApiTags('courses')
@ApiBearerAuth()
@Controller('courses')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LessonJournalController {
  constructor(private readonly lessonJournalService: LessonJournalService) {}

  @Get(':courseAssignmentId/journal')
  @Roles(Role.TEACHER, Role.DEPARTMENT_HEAD, Role.DEAN, Role.ADMIN)
  @ApiResponse({ type: LessonJournalEntryDto, isArray: true })
  findJournal(
    @Param('courseAssignmentId') courseAssignmentId: string,
    @Query() query: LessonJournalQueryDto,
    @Request() req: RequestWithUser,
  ): Promise<PaginatedDto<LessonJournalEntryDto>> {
    return this.lessonJournalService.findEntries(
      courseAssignmentId,
      query,
      req.user.sub,
      req.user.role,
    );
  }

  @Post(':courseAssignmentId/journal')
  @Roles(Role.TEACHER, Role.DEPARTMENT_HEAD, Role.DEAN, Role.ADMIN)
  @ApiResponse({ type: LessonJournalEntryDto })
  createJournalEntry(
    @Param('courseAssignmentId') courseAssignmentId: string,
    @Body() dto: CreateLessonJournalEntryDto,
    @Request() req: RequestWithUser,
  ): Promise<LessonJournalEntryDto> {
    return this.lessonJournalService.create(
      courseAssignmentId,
      dto,
      req.user.sub,
      req.user.role,
    );
  }

  @Patch('journal/:id')
  @Roles(Role.TEACHER, Role.DEPARTMENT_HEAD, Role.DEAN, Role.ADMIN)
  @ApiResponse({ type: LessonJournalEntryDto })
  updateJournalEntry(
    @Param('id') id: string,
    @Body() dto: UpdateLessonJournalEntryDto,
    @Request() req: RequestWithUser,
  ): Promise<LessonJournalEntryDto> {
    return this.lessonJournalService.update(
      id,
      dto,
      req.user.sub,
      req.user.role,
    );
  }

  @Delete('journal/:id')
  @Roles(Role.TEACHER, Role.DEPARTMENT_HEAD, Role.DEAN, Role.ADMIN)
  removeJournalEntry(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.lessonJournalService.remove(id, req.user.sub, req.user.role);
  }
}
