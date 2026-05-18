import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import type { CourseAssignment, PaginatedResponse } from '../../types';
import { useTranslation } from 'react-i18next';

export default function CoursesPage() {
  const { t } = useTranslation();

  const { data: courses = [], isLoading } = useQuery({
    queryKey: ['courses', 'my'],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<CourseAssignment>>('/courses/my');
      return data.docs;
    },
  });

  const formatTeacherName = (ca: CourseAssignment) => {
    if (ca.teacherName) return ca.teacherName;
    if (ca.teacher) {
      const { lastName, firstName, middleName } = ca.teacher;
      return [lastName, firstName, middleName].filter(Boolean).join(' ');
    }
    return '';
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        {t('courses.title')}
      </h1>

      {courses.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center text-gray-400">
          {t('courses.notFound')}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {courses.map((ca) => (
            <div
              key={ca.id}
              className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded font-medium">
                  {ca.courseCode}
                </span>
                {ca.credits && (
                  <span className="text-xs text-gray-400">
                    {ca.credits} {t('courses.credits')}
                  </span>
                )}
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">
                {ca.courseName}
              </h3>
              {formatTeacherName(ca) && (
                <p className="text-sm text-gray-500">
                  {t('courses.teacher')}: {formatTeacherName(ca)}
                </p>
              )}
              {ca.groupCode && (
                <p className="text-sm text-gray-500">
                  {t('courses.group')}: {ca.groupCode}
                </p>
              )}
              <p className="text-xs text-gray-400 mt-2">
                {ca.academicYear}, {t('courses.semester')} {ca.semester}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
