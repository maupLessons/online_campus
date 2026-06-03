import { PartialType } from '@nestjs/swagger';
import { CreateLessonJournalEntryDto } from './create-lesson-journal-entry.dto';

export class UpdateLessonJournalEntryDto extends PartialType(
  CreateLessonJournalEntryDto,
) {}
