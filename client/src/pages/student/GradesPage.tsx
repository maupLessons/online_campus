import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import type { Grade, StudentCourse, PaginatedResponse } from '../../types';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

const TYPE_LABEL_KEYS: Record<string, string> = {
  current: 'grades.types.current',
  module: 'grades.types.module',
  exam: 'grades.types.exam',
  final: 'grades.types.final',
};

export default function GradesPage() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'en' ? 'en-US' : 'uk-UA';

  const { data: courses = [], isLoading: isLoadingCourses } = useQuery({
    queryKey: ['grades', 'courses'],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<StudentCourse>>(
        '/courses/grades/my/courses',
      );
      return data.docs;
    },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        {t('grades.title')}
      </h1>

      {isLoadingCourses ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : courses.length === 0 ? (
        <p className="text-gray-400 text-sm">{t('grades.empty')}</p>
      ) : (
        <div className="space-y-4">
          {courses.map((course) => (
            <GradeAccordionItem
              key={course.courseAssignmentId}
              course={course}
              isExpanded={expandedId === course.courseAssignmentId}
              onToggle={() =>
                setExpandedId(
                  expandedId === course.courseAssignmentId
                    ? null
                    : course.courseAssignmentId,
                )
              }
              locale={locale}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function GradeAccordionItem({
  course,
  isExpanded,
  onToggle,
  locale,
  t,
}: {
  course: StudentCourse;
  isExpanded: boolean;
  onToggle: () => void;
  locale: string;
  t: TFunction;
}) {
  const { data: grades = [], isLoading: isLoadingGrades } = useQuery({
    queryKey: ['grades', 'course', course.courseAssignmentId],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<Grade>>(
        `/courses/grades/my/courses/${course.courseAssignmentId}`,
      );
      return data.docs;
    },
    enabled: isExpanded,
  });

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-6 py-4 transition-colors hover:bg-gray-50">
        <div className="text-left">
          <h2 className="text-lg font-semibold text-gray-800">
            {course.courseName}
          </h2>
          <p className="text-sm text-gray-500">
            {course.courseCode} | {course.academicYear},{' '}
            {t('courses.semester')} {course.semester}
          </p>
        </div>
        <span className="text-gray-400">{isExpanded ? '▲' : '▼'}</span>
      </button>

      {isExpanded && (
        <div className="mt-4 border-t border-gray-100 px-6 pb-6">
          {isLoadingGrades ? (
            <div className="py-4 text-center text-sm text-gray-400">
              {t('auth.loading')}
            </div>
          ) : grades.length === 0 ? (
            <div className="py-4 text-center text-sm text-gray-400">
              {t('grades.empty')}
            </div>
          ) : (
            <div className="mt-2 overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b bg-gray-50 text-left text-gray-500">
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider">
                      {t('grades.date')}
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider">
                      {t('grades.type')}
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider">
                      {t('grades.source')}
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider">
                      {t('grades.grade')}
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider">
                      {t('grades.comment')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {grades.map((g) => (
                    <tr key={g.id} className="border-b last:border-0">
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {new Date(g.date).toLocaleDateString(locale)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {TYPE_LABEL_KEYS[g.type]
                          ? t(TYPE_LABEL_KEYS[g.type])
                          : g.type}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {getGradeSourceLabel(g, t)}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span
                          className={`font-bold ${
                            g.value >= 90
                              ? 'text-green-600'
                              : g.value >= 75
                                ? 'text-blue-600'
                                : g.value >= 60
                                  ? 'text-yellow-600'
                                  : 'text-red-600'
                          }`}>
                          {g.value}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 italic">
                        {g.comment || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function getGradeSourceLabel(grade: Grade, t: TFunction): string {
  if (grade.assignmentTitle) {
    return t('grades.assignmentSource', { title: grade.assignmentTitle });
  }

  if (grade.lessonJournalEntryId) {
    return t('grades.journalSource');
  }

  return t('grades.manualSource');
}
