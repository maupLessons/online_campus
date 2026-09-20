import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import * as paginate from 'mongoose-paginate-v2';
import { Course } from './course.schema';
import { CourseResource, CourseResourceSchema } from './course-resource.schema';
import { Group } from '../../references/schemas';
import { User } from '../../users/schemas';
import type { AcademicTerm } from '../../academic-terms/schemas/academic-term.schema';

export type CourseAssignmentDocument = CourseAssignment & Document;

export enum CourseAssignmentSource {
  STANDARD = 'standard',
  ELECTIVE = 'elective',
}

@Schema({ timestamps: true })
export class CourseAssignment {
  _id: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Course', required: true })
  course: Course;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Group', required: true })
  group: Group;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  teacher: User;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'AcademicTerm',
    required: true,
    index: true,
  })
  term: MongooseSchema.Types.ObjectId | AcademicTerm;

  @Prop({ type: Number, min: 1, max: 12, default: null })
  curriculumSemester?: number | null;

  @Prop({
    type: String,
    enum: Object.values(CourseAssignmentSource),
    default: CourseAssignmentSource.STANDARD,
    required: true,
  })
  source: CourseAssignmentSource;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'ElectiveSelectionPeriod',
    default: null,
  })
  electivePeriod?: MongooseSchema.Types.ObjectId | null;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'ElectiveDiscipline',
    default: null,
  })
  electiveDiscipline?: MongooseSchema.Types.ObjectId | null;

  @Prop({
    type: [{ type: MongooseSchema.Types.ObjectId, ref: 'User' }],
    default: [],
  })
  enrolledStudents: Array<User | MongooseSchema.Types.ObjectId>;

  @Prop({ type: Date, default: null })
  finalizedAt?: Date | null;

  @Prop({ type: [CourseResourceSchema], default: [] })
  resources: CourseResource[];
}

export const CourseAssignmentSchema =
  SchemaFactory.createForClass(CourseAssignment);

CourseAssignmentSchema.plugin(paginate);
CourseAssignmentSchema.index({ course: 1 });
CourseAssignmentSchema.index({ group: 1, term: 1 });
CourseAssignmentSchema.index({ teacher: 1, term: 1 });
CourseAssignmentSchema.index({ enrolledStudents: 1 });
CourseAssignmentSchema.index(
  { electivePeriod: 1, electiveDiscipline: 1, group: 1 },
  { sparse: true },
);
CourseAssignmentSchema.index(
  { course: 1, group: 1, term: 1 },
  { unique: true },
);
