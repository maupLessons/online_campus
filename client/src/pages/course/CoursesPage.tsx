import { useQuery } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { moodleBaseUrl } from '../../config/externalLearning';
import type { CourseAssignment, PaginatedResponse } from '../../types';
import { useTranslation } from 'react-i18next';

const formatTeacherName = (ca: CourseAssignment) => {
  if (ca.teacherName) return ca.teacherName;
  if (ca.teacher) {
    const { lastName, firstName, middleName } = ca.teacher;
    return [lastName, firstName, middleName].filter(Boolean).join(' ');
  }
  return '';
};

function CourseCard({
  ca,
  t,
}: {
  ca: CourseAssignment;
  t: (key: string) => string;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow flex flex-col h-full">
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded font-medium">
          {ca.courseCode}
        </span>
        {ca.source === 'elective' && (
          <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded font-medium">
            {t('courses.elective')}
          </span>
        )}
        {ca.credits && (
          <span className="text-xs text-gray-400">
            {ca.credits} {t('courses.credits')}
          </span>
        )}
      </div>
      
      <h3 className="font-semibold text-gray-900 mb-2">{ca.courseName}</h3>
      <div className="flex-grow mb-4">
        {formatTeacherName(ca) && <p className="text-sm text-gray-500">{t('courses.teacher')}: {formatTeacherName(ca)}</p>}
        {ca.groupCode && <p className="text-sm text-gray-500">{t('courses.group')}: {ca.groupCode}</p>}
        <p className="text-xs text-gray-400 mt-2">{ca.academicYear}, {t('courses.semester')} {ca.semester}</p>
      </div>

      <div className="mt-auto grid gap-2 border-t border-gray-100 pt-4">
        <Link 
          to={`/courses/${ca.id}`}
          className="block w-full text-center bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium py-2 px-4 rounded-lg transition-colors text-sm"
        >
          {t('courses.openCourse')}
        </Link>
        <a
          href={moodleBaseUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
        >
          {t('courses.openMoodle')}
          <ExternalLink size={14} />
        </a>
      </div>
    </div>
  );
}

export default function CoursesPage() {
  const { t } = useTranslation();

  const { data: courses = [], isLoading } = useQuery({
    queryKey: ['courses', 'my'],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<CourseAssignment>>('/courses/my');
      return data.docs;
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 rounded-xl border border-blue-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {t('courses.title')}
            </h1>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              {t('courses.moodleNoticeText')}
            </p>
          </div>
          <a
            href={moodleBaseUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            {t('courses.openMoodle')}
            <ExternalLink size={16} />
          </a>
        </div>
      </div>

      {courses.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center text-gray-400">
          {t('courses.notFound')}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {courses.map((ca: CourseAssignment) => (
            <CourseCard key={ca.id} ca={ca} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}
