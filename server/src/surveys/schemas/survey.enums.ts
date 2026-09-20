export enum SurveyStatus {
  DRAFT = 'draft',
  SCHEDULED = 'scheduled',
  ACTIVE = 'active',
  CLOSED = 'closed',
}

export enum SurveyTargetType {
  ALL = 'all',
  TEACHERS = 'teachers',
  STUDENTS_TEACHERS = 'students_teachers',
  GROUPS = 'groups',
  COURSE = 'course',
}

export enum SurveyQuestionType {
  SINGLE = 'single',
  MULTIPLE = 'multiple',
  RATING = 'rating',
  TEXT = 'text',
}
