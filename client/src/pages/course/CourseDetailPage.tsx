import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import type { CourseAssignment, Material, Assignment, GradeJournalResponse, PaginatedResponse } from '../../types';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../store/authStore';
import { Role } from '../../types';

type TabType = 'materials' | 'assignments' | 'students' | 'grades';

export default function CourseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabType>('materials');
  const locale = i18n.language === 'en' ? 'en-US' : 'uk-UA';

  const { data: course, isLoading: isLoadingCourse, error: courseError } = useQuery({
    queryKey: ['courses', id],
    queryFn: async () => {
      const { data } = await api.get<CourseAssignment>(`/courses/course-assignments/${id}`);
      return data;
    },
    enabled: !!id,
  });

  const { data: materialsData, isLoading: isLoadingMaterials } = useQuery({
    queryKey: ['courses', id, 'materials'],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<Material>>(`/courses/${id}/materials`);
      return data;
    },
    enabled: !!id && activeTab === 'materials',
  });

  const { data: assignmentsData, isLoading: isLoadingAssignments } = useQuery({
    queryKey: ['courses', id, 'assignments'],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<Assignment>>(`/courses/${id}/assignments`);
      return data;
    },
    enabled: !!id && activeTab === 'assignments',
  });

  const { data: gradesData, isLoading: isLoadingGrades } = useQuery({
    queryKey: ['courses', id, 'grades'],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<GradeJournalResponse>>(`/courses/${id}/grades`);
      return data;
    },
    enabled: !!id && activeTab === 'grades',
  });

  const isTeacherOrAdmin = user?.role && ([
    Role.TEACHER,
    Role.DEPARTMENT_HEAD,
    Role.DEAN,
    Role.ADMIN,
    Role.RECTOR,
    Role.PRESIDENT
  ] as Role[]).includes(user.role);

  const tabs: { id: TabType; label: string }[] = [
    { id: 'materials', label: t('courses.tabs.materials') },
    { id: 'assignments', label: t('courses.tabs.assignments') },
  ];

  if (isTeacherOrAdmin) {
    tabs.push({ id: 'students', label: t('courses.tabs.students') });
    tabs.push({ id: 'grades', label: t('courses.tabs.grades') });
  }

  const formatTeacherName = (ca: CourseAssignment) => {
    if (ca.teacher) {
      const { lastName, firstName, middleName } = ca.teacher;
      return [lastName, firstName, middleName].filter(Boolean).join(' ');
    }
    return '';
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (isLoadingCourse) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (courseError || !course) {
    return (
      <div className="bg-red-50 text-red-700 p-4 rounded-xl border border-red-200">
        {t('courses.notFound')}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <Link
            to="/courses"
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            title={t('common.back')}
          >
            <svg
              className="w-6 h-6 text-gray-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{course.courseName}</h1>
            <p className="text-gray-500">{course.courseCode} • {course.academicYear}, {course.semester} {t('courses.semester')}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
              <span className="text-gray-500">{t('courses.teacher')}:</span>
              <span className="font-medium text-gray-900">{formatTeacherName(course) || '-'}</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
              <span className="text-gray-500">{t('courses.group')}:</span>
              <span className="font-medium text-gray-900">{course.groupCode || '-'}</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
              <span className="text-gray-500">{t('courses.credits')}:</span>
              <span className="font-medium text-gray-900">{course.credits || '-'}</span>
            </div>
          </div>
        </div>

        <div className="border-b border-gray-200">
          <nav className="flex -mb-px px-6 space-x-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  py-4 px-1 border-b-2 font-medium text-sm transition-colors
                  ${activeTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}
                `}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'materials' && (
            isLoadingMaterials ? (
              <div className="text-center py-12 text-gray-400">{t('auth.loading')}</div>
            ) : !materialsData?.docs.length ? (
              <div className="text-center py-12 text-gray-500 italic">{t('courses.materialsEmpty')}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('grades.date')}</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('users.fullName')}</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('nav.assignments')}</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {materialsData.docs.map((m) => (
                      <tr key={m.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(m.publishDate).toLocaleDateString(locale)}
                        </td>
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">
                          <div>
                            <div>{m.title}</div>
                            {m.description && <div className="text-xs text-gray-500 font-normal">{m.description}</div>}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          <div className="flex flex-col gap-1">
                            {m.files.map(f => (
                              <a key={f.id} href={`/api/files/download/${f.id}`} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline flex items-center gap-1">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                {f.originalName} <span className="text-xs text-gray-400">({formatSize(f.size)})</span>
                              </a>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {activeTab === 'assignments' && (
            isLoadingAssignments ? (
              <div className="text-center py-12 text-gray-400">{t('auth.loading')}</div>
            ) : !assignmentsData?.docs.length ? (
              <div className="text-center py-12 text-gray-500 italic">{t('assignments.empty')}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('assignments.title')}</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('assignments.deadline')}</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('assignments.maxScore')}</th>
                      {!isTeacherOrAdmin && <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('users.status')}</th>}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {assignmentsData.docs.map((a) => (
                      <tr key={a.id}>
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">
                          <div>
                            <div>{a.title}</div>
                            <div className="text-xs text-gray-500 font-normal">{a.description}</div>
                            {a.files && a.files.length > 0 && (
                              <div className="mt-2 flex flex-col gap-1">
                                {a.files.map(f => (
                                  <a key={f.id} href={`/api/files/download/${f.id}`} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline flex items-center gap-1 font-normal text-xs">
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                    {f.originalName}
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(a.dueDate).toLocaleDateString(locale)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {a.maxScore}
                        </td>
                        {!isTeacherOrAdmin && (
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            {a.submission ? (
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                a.submission.status === 'graded' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                              }`}>
                                {a.submission.status === 'graded' ? `${t('grades.grade')}: ${a.submission.score}` : t('assignments.statusPending')}
                              </span>
                            ) : (
                              <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                                {t('assignments.statusNotSubmitted')}
                              </span>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {activeTab === 'students' && (
            <div className="text-center py-12 text-gray-500 italic">
              {t('courses.studentsNotFound')}
            </div>
          )}

          {activeTab === 'grades' && (
            isLoadingGrades ? (
              <div className="text-center py-12 text-gray-400">{t('auth.loading')}</div>
            ) : !gradesData?.docs.length ? (
              <div className="text-center py-12 text-gray-500 italic">{t('grades.empty')}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      {isTeacherOrAdmin && <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('users.fullName')}</th>}
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('grades.date')}</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('grades.type')}</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('grades.grade')}</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('grades.comment')}</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {gradesData.docs.flatMap(row => 
                      row.grades.map(g => (
                        <tr key={g.id}>
                          {isTeacherOrAdmin && (
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {row.studentName}
                            </td>
                          )}
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {new Date(g.date).toLocaleDateString(locale)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 uppercase">
                            {t(`grades.types.${g.type}`)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                            {g.value}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500 italic">
                            {g.comment || '-'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
