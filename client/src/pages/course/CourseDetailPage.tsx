import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { coursesApi, coursesQueryKeys } from '../../services/coursesApi';
import { useAuthStore } from '../../store/authStore';
import { useAutoDismissState } from '../../hooks/useAutoDismissState';
import { formatTerm } from '../../utils/formatTerm';
import { resourceTypeIcon } from '../../utils/resourceLinks';
import ResourcesEditor from '../../components/course/ResourcesEditor';
import MoodleUrlEditor from '../../components/course/MoodleUrlEditor';
import { Role, type ScheduleEntry } from '../../types';

function InfoLine({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="font-medium text-slate-900">{value ?? '—'}</p>
    </div>
  );
}

function LessonRow({ lesson, t }: { lesson: ScheduleEntry; t: (k: string) => string }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm">
      <span className="font-medium text-slate-900">{lesson.date} · {lesson.startTime}–{lesson.endTime}</span>
      <span className="text-slate-600">{t(`schedule.types.${lesson.type}`)}</span>
      {lesson.onlineUrl ? (
        <a href={lesson.onlineUrl} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline">{t('courses.card.online')}</a>
      ) : (
        <span className="text-slate-500">{lesson.classroom ?? '—'}</span>
      )}
    </li>
  );
}

export default function CourseDetailPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [editing, setEditing] = useState(false);
  const [statusMessage, setStatusMessage] = useAutoDismissState<string>('');

  const { data: card, isLoading, isError } = useQuery({
    queryKey: coursesQueryKeys.card(id),
    queryFn: () => coursesApi.getCard(id),
    enabled: Boolean(id),
  });

  if (isLoading) return <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" /></div>;
  if (isError || !card) return <div className="rounded-xl border border-red-100 bg-red-50 p-6 text-red-700">{t('courses.notFound')}</div>;

  // card.term.termNumber — number per the CourseAssignmentCard contract (Task 6),
  // the domain narrows it to 1|2 (AcademicTermRef), and formatTerm expects exactly this narrowing.
  const term = { ...card.term, termNumber: card.term.termNumber as 1 | 2 };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <Link to="/courses" className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50" title={t('courses.card.back')}>
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {card.course.name}
              {card.source === 'elective' && <span className="ml-2 rounded bg-emerald-100 px-2 py-1 align-middle text-xs font-medium text-emerald-700">{t('courses.elective')}</span>}
            </h1>
            <p className="text-sm text-slate-500">{card.course.code} · {formatTerm(term, t)}</p>
          </div>
        </div>
        <a href={card.moodleHref} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
          {t('courses.openMoodle')} <ExternalLink className="h-4 w-4" />
        </a>
      </div>

      {statusMessage && <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">{statusMessage}</div>}

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 text-sm md:grid-cols-4">
          <InfoLine label={t('courses.card.department')} value={card.course.department.name} />
          <InfoLine label={t('courses.credits')} value={card.course.credits} />
          <InfoLine label={t('courses.teacher')} value={card.teacher?.fullName} />
          <InfoLine label={t('courses.group')} value={card.group.code} />
          {card.curriculumSemester && <InfoLine label={t('courses.card.curriculumSemester')} value={card.curriculumSemester} />}
        </div>
        {card.course.description && (
          <div className="mt-6">
            <h2 className="mb-2 text-sm font-semibold text-slate-700">{t('courses.card.description')}</h2>
            <p className="whitespace-pre-line text-sm text-slate-700">{card.course.description}</p>
          </div>
        )}
        {card.canEditMoodleUrl && (
          <div className="mt-6">
            <MoodleUrlEditor courseId={card.course.id} assignmentId={card.id} moodleUrl={card.course.moodleUrl} isAdmin={user?.role === Role.ADMIN} onSaved={setStatusMessage} />
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">{t('courses.card.upcoming')}</h2>
        {card.meta.scheduleUnavailable ? (
          <p className="text-sm text-amber-700">{t('courses.card.upcomingUnavailable')}</p>
        ) : card.upcomingLessons.length === 0 ? (
          <p className="text-sm text-slate-500">{t('courses.card.upcomingEmpty')}</p>
        ) : (
          <ul className="space-y-2">{card.upcomingLessons.map((lesson) => <LessonRow key={lesson.id} lesson={lesson} t={t} />)}</ul>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">{t('courses.resources.title')}</h2>
          {card.canEditResources && !editing && (
            <button type="button" className="text-sm text-blue-700 underline-offset-4 hover:underline" onClick={() => setEditing(true)}>{t('courses.resources.edit')}</button>
          )}
        </div>
        {editing ? (
          <ResourcesEditor assignmentId={card.id} resources={card.resources} onClose={() => setEditing(false)} onSaved={setStatusMessage} />
        ) : card.resources.length === 0 ? (
          <p className="text-sm text-slate-500">{t('courses.resources.empty')}</p>
        ) : (
          <ul className="space-y-2">
            {card.resources.map((resource) => {
              const Icon = resourceTypeIcon(resource.type);
              return (
                <li key={resource.id}>
                  <a href={resource.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-blue-700 hover:underline">
                    <Icon className="h-4 w-4" /> {resource.title}
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="text-center text-sm text-slate-500">{t('courses.card.moodleNote')}</p>
    </div>
  );
}
