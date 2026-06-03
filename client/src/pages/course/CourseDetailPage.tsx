import { useMemo, useState } from 'react';
import type { ChangeEvent, ReactNode, SyntheticEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  BookOpen,
  ClipboardList,
  Download,
  Edit3,
  GraduationCap,
  Link as LinkIcon,
  Plus,
  Save,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import {
  Role,
  type Assignment,
  type CourseAssignment,
  type Grade,
  type GradeJournalResponse,
  type LessonJournalEntry,
  type Material,
  type MaterialCategory,
  type PaginatedResponse,
  type ScheduleEntry,
  type User,
} from '../../types';

type TabType = 'materials' | 'assignments' | 'students' | 'journal' | 'grades';
type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

const MATERIAL_CATEGORY_VALUES: MaterialCategory[] = [
  'lecture',
  'presentation',
  'syllabus',
  'work_program',
  'external_resource',
  'other',
];

const ATTENDANCE_STATUS_VALUES: AttendanceStatus[] = [
  'present',
  'absent',
  'late',
  'excused',
];

const LESSON_TYPE_VALUES = [
  'lecture',
  'seminar',
  'lab',
  'exam',
  'consultation',
] as const;

const GRADE_TYPE_VALUES = ['current', 'module', 'exam', 'final'] as const;

const emptyMaterialForm = {
  title: '',
  description: '',
  category: 'lecture' as MaterialCategory,
  linkTitle: '',
  linkUrl: '',
};

const emptyAssignmentForm = {
  title: '',
  description: '',
  criteria: '',
  dueDate: '',
  maxScore: 100,
  linkTitle: '',
  linkUrl: '',
};

const emptyJournalForm = {
  scheduleEntryId: '',
  date: new Date().toISOString().slice(0, 10),
  startTime: '',
  endTime: '',
  type: 'lecture',
  topic: '',
  description: '',
};

const emptyGradeEditForm = {
  type: 'current',
  value: '',
  comment: '',
};

const isTeacherLike = (role?: Role) =>
  Boolean(
    role &&
      ([
        Role.TEACHER,
        Role.DEPARTMENT_HEAD,
        Role.DEAN,
        Role.ADMIN,
        Role.RECTOR,
        Role.PRESIDENT,
      ] as Role[]).includes(role),
  );

const formatTeacherName = (ca: CourseAssignment) => {
  if (ca.teacherName) return ca.teacherName;
  if (!ca.teacher) return '';

  const { lastName, firstName, middleName } = ca.teacher;
  return [lastName, firstName, middleName].filter(Boolean).join(' ');
};

const formatUserName = (user: User) =>
  [user.lastName, user.firstName, user.middleName].filter(Boolean).join(' ');

const firstResourceLink = (
  links: Array<{ title: string; url: string }> | undefined,
) => links?.[0] ?? { title: '', url: '' };

const toDateTimeLocal = (value: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 16);
  return date.toISOString().slice(0, 16);
};

async function uploadFile(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await api.post<{ fileId: string }>('/files/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data.fileId;
}

export default function CourseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const locale = i18n.language === 'en' ? 'en-US' : 'uk-UA';
  const [activeTab, setActiveTab] = useState<TabType>('materials');
  const [statusMessage, setStatusMessage] = useState('');
  const [materialForm, setMaterialForm] = useState(emptyMaterialForm);
  const [materialFile, setMaterialFile] = useState<File | null>(null);
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(
    null,
  );
  const [assignmentForm, setAssignmentForm] = useState(emptyAssignmentForm);
  const [assignmentFile, setAssignmentFile] = useState<File | null>(null);
  const [editingAssignmentId, setEditingAssignmentId] = useState<string | null>(
    null,
  );
  const [journalForm, setJournalForm] = useState(emptyJournalForm);
  const [editingJournalId, setEditingJournalId] = useState<string | null>(null);
  const [attendanceForm, setAttendanceForm] = useState<
    Record<string, { status: AttendanceStatus; comment: string }>
  >({});
  const [gradeForm, setGradeForm] = useState<
    Record<string, { value: string; comment: string }>
  >({});
  const [editingGradeId, setEditingGradeId] = useState<string | null>(null);
  const [gradeEditForm, setGradeEditForm] = useState(emptyGradeEditForm);

  const teacherMode = isTeacherLike(user?.role);

  const {
    data: course,
    isLoading: isLoadingCourse,
    error: courseError,
  } = useQuery({
    queryKey: ['courses', id],
    queryFn: async () => {
      const { data } = await api.get<CourseAssignment>(
        `/courses/course-assignments/${id}`,
      );
      return data;
    },
    enabled: Boolean(id),
  });

  const { data: materialsData, isLoading: isLoadingMaterials } = useQuery({
    queryKey: ['courses', id, 'materials'],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<Material>>(
        `/courses/${id}/materials`,
      );
      return data;
    },
    enabled: Boolean(id) && activeTab === 'materials',
  });

  const { data: assignmentsData, isLoading: isLoadingAssignments } = useQuery({
    queryKey: ['courses', id, 'assignments'],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<Assignment>>(
        `/courses/${id}/assignments`,
      );
      return data;
    },
    enabled: Boolean(id) && activeTab === 'assignments',
  });

  const { data: students = [], isLoading: isLoadingStudents } = useQuery({
    queryKey: ['courses', id, 'students'],
    queryFn: async () => {
      const { data } = await api.get<User[]>(
        `/courses/course-assignments/${id}/students`,
      );
      return data;
    },
    enabled: Boolean(id) && teacherMode,
  });

  const { data: gradesData, isLoading: isLoadingGrades } = useQuery({
    queryKey: ['courses', id, 'grades'],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<GradeJournalResponse>>(
        `/courses/${id}/grades?limit=100`,
      );
      return data;
    },
    enabled: Boolean(id) && teacherMode && activeTab === 'grades',
  });

  const { data: journalData, isLoading: isLoadingJournal } = useQuery({
    queryKey: ['courses', id, 'journal'],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<LessonJournalEntry>>(
        `/courses/${id}/journal?limit=50`,
      );
      return data;
    },
    enabled: Boolean(id) && teacherMode && activeTab === 'journal',
  });

  const { data: scheduleEntries = [] } = useQuery({
    queryKey: ['schedule', 'my', id],
    queryFn: async () => {
      const { data } = await api.get<ScheduleEntry[]>('/schedule/my');
      return data.filter((entry) => entry.courseAssignmentId === id);
    },
    enabled: Boolean(id) && teacherMode && activeTab === 'journal',
  });

  const tabs = useMemo(() => {
    const base: Array<{ id: TabType; label: string; icon: typeof BookOpen }> = [
      { id: 'materials', label: t('courses.tabs.materials'), icon: BookOpen },
      {
        id: 'assignments',
        label: t('courses.tabs.assignments'),
        icon: ClipboardList,
      },
    ];

    if (teacherMode) {
      base.push(
        { id: 'students', label: t('courses.tabs.students'), icon: Users },
        { id: 'journal', label: t('courses.tabs.journal'), icon: BookOpen },
        { id: 'grades', label: t('courses.tabs.grades'), icon: GraduationCap },
      );
    }

    return base;
  }, [t, teacherMode]);

  const showStatus = (message: string) => {
    setStatusMessage(message);
    window.setTimeout(() => {
      setStatusMessage((current) => (current === message ? '' : current));
    }, 5000);
  };

  const refreshCourseWork = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['courses', id, 'materials'] }),
      queryClient.invalidateQueries({
        queryKey: ['courses', id, 'assignments'],
      }),
      queryClient.invalidateQueries({ queryKey: ['courses', id, 'journal'] }),
      queryClient.invalidateQueries({ queryKey: ['courses', id, 'grades'] }),
    ]);
  };

  const saveMaterialMutation = useMutation({
    mutationFn: async () => {
      const fileIds = materialFile ? [await uploadFile(materialFile)] : undefined;
      const resourceLinks =
        materialForm.linkTitle.trim() && materialForm.linkUrl.trim()
          ? [
              {
                title: materialForm.linkTitle.trim(),
                url: materialForm.linkUrl.trim(),
              },
            ]
          : [];

      const payload = {
        title: materialForm.title.trim(),
        description: materialForm.description.trim() || undefined,
        category: materialForm.category,
        resourceLinks,
        ...(fileIds ? { fileIds } : {}),
      };

      if (editingMaterialId) {
        await api.put(`/courses/${id}/materials/${editingMaterialId}`, payload);
        return;
      }

      await api.post(`/courses/${id}/materials`, payload);
    },
    onSuccess: async () => {
      setMaterialForm(emptyMaterialForm);
      setMaterialFile(null);
      const messageKey = editingMaterialId
        ? 'teacherCourse.materials.updated'
        : 'teacherCourse.materials.created';
      setEditingMaterialId(null);
      showStatus(t(messageKey));
      await refreshCourseWork();
    },
    onError: () => showStatus(t('teacherCourse.materials.saveError')),
  });

  const saveAssignmentMutation = useMutation({
    mutationFn: async () => {
      const fileIds = assignmentFile
        ? [await uploadFile(assignmentFile)]
        : undefined;
      const resourceLinks =
        assignmentForm.linkTitle.trim() && assignmentForm.linkUrl.trim()
          ? [
              {
                title: assignmentForm.linkTitle.trim(),
                url: assignmentForm.linkUrl.trim(),
              },
            ]
          : [];

      const payload = {
        title: assignmentForm.title.trim(),
        description: assignmentForm.description.trim(),
        criteria: assignmentForm.criteria.trim() || undefined,
        dueDate: assignmentForm.dueDate,
        maxScore: Number(assignmentForm.maxScore),
        resourceLinks,
        ...(fileIds ? { fileIds } : {}),
      };

      if (editingAssignmentId) {
        await api.put(`/courses/assignments/${editingAssignmentId}`, payload);
        return;
      }

      await api.post(`/courses/${id}/assignments`, payload);
    },
    onSuccess: async () => {
      setAssignmentForm(emptyAssignmentForm);
      setAssignmentFile(null);
      const messageKey = editingAssignmentId
        ? 'teacherCourse.assignments.updated'
        : 'teacherCourse.assignments.created';
      setEditingAssignmentId(null);
      showStatus(t(messageKey));
      await refreshCourseWork();
    },
    onError: () => showStatus(t('teacherCourse.assignments.saveError')),
  });

  const saveJournalMutation = useMutation({
    mutationFn: async () => {
      const attendance = students.map((student) => ({
        studentId: student.id,
        status: attendanceForm[student.id]?.status ?? 'present',
        comment: attendanceForm[student.id]?.comment?.trim() || undefined,
      }));
      const grades = students
        .map((student) => ({
          studentId: student.id,
          value: gradeForm[student.id]?.value,
          comment: gradeForm[student.id]?.comment?.trim() || undefined,
        }))
        .filter((grade) => grade.value !== undefined && grade.value !== '')
        .map((grade) => ({
          studentId: grade.studentId,
          value: Number(grade.value),
          type: 'current',
          comment: grade.comment,
        }));

      const payload = {
        scheduleEntryId: journalForm.scheduleEntryId || undefined,
        date: journalForm.date,
        startTime: journalForm.startTime || undefined,
        endTime: journalForm.endTime || undefined,
        type: journalForm.type || undefined,
        topic: journalForm.topic.trim(),
        description: journalForm.description.trim() || undefined,
        attendance,
        grades,
      };

      if (editingJournalId) {
        await api.patch(`/courses/journal/${editingJournalId}`, payload);
        return;
      }

      await api.post(`/courses/${id}/journal`, payload);
    },
    onSuccess: async () => {
      setJournalForm(emptyJournalForm);
      setEditingJournalId(null);
      setAttendanceForm({});
      setGradeForm({});
      showStatus(
        t(
          editingJournalId
            ? 'teacherCourse.journal.updated'
            : 'teacherCourse.journal.saved',
        ),
      );
      await refreshCourseWork();
    },
    onError: () => showStatus(t('teacherCourse.journal.saveError')),
  });

  const deleteMaterialMutation = useMutation({
    mutationFn: async (materialId: string) => {
      await api.delete(`/courses/${id}/materials/${materialId}`);
    },
    onSuccess: async () => {
      showStatus(t('teacherCourse.materials.deleted'));
      await refreshCourseWork();
    },
    onError: () => showStatus(t('teacherCourse.materials.deleteError')),
  });

  const deleteAssignmentMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      await api.delete(`/courses/assignments/${assignmentId}`);
    },
    onSuccess: async () => {
      showStatus(t('teacherCourse.assignments.deleted'));
      await refreshCourseWork();
    },
    onError: () => showStatus(t('teacherCourse.assignments.deleteError')),
  });

  const deleteJournalMutation = useMutation({
    mutationFn: async (journalId: string) => {
      await api.delete(`/courses/journal/${journalId}`);
    },
    onSuccess: async () => {
      showStatus(t('teacherCourse.journal.deleted'));
      await refreshCourseWork();
    },
    onError: () => showStatus(t('teacherCourse.journal.deleteError')),
  });

  const updateGradeMutation = useMutation({
    mutationFn: async () => {
      if (!editingGradeId) return;

      await api.patch(`/courses/grades/${editingGradeId}`, {
        type: gradeEditForm.type,
        value: Number(gradeEditForm.value),
        comment: gradeEditForm.comment.trim() || undefined,
      });
    },
    onSuccess: async () => {
      setEditingGradeId(null);
      setGradeEditForm(emptyGradeEditForm);
      showStatus(t('teacherCourse.grades.saved'));
      await refreshCourseWork();
    },
    onError: () => showStatus(t('teacherCourse.grades.saveError')),
  });

  const deleteGradeMutation = useMutation({
    mutationFn: async (gradeId: string) => {
      await api.delete(`/courses/grades/${gradeId}`);
    },
    onSuccess: async () => {
      setEditingGradeId(null);
      setGradeEditForm(emptyGradeEditForm);
      showStatus(t('teacherCourse.grades.deleted'));
      await refreshCourseWork();
    },
    onError: () => showStatus(t('teacherCourse.grades.deleteError')),
  });

  const resetMaterialForm = () => {
    setEditingMaterialId(null);
    setMaterialForm(emptyMaterialForm);
    setMaterialFile(null);
  };

  const startEditMaterial = (material: Material) => {
    const link = firstResourceLink(material.resourceLinks);
    setEditingMaterialId(material.id);
    setMaterialForm({
      title: material.title,
      description: material.description ?? '',
      category: material.category ?? 'lecture',
      linkTitle: link.title,
      linkUrl: link.url,
    });
    setMaterialFile(null);
  };

  const resetAssignmentForm = () => {
    setEditingAssignmentId(null);
    setAssignmentForm(emptyAssignmentForm);
    setAssignmentFile(null);
  };

  const startEditAssignment = (assignment: Assignment) => {
    const link = firstResourceLink(assignment.resourceLinks);
    setEditingAssignmentId(assignment.id);
    setAssignmentForm({
      title: assignment.title,
      description: assignment.description,
      criteria: assignment.criteria ?? '',
      dueDate: toDateTimeLocal(assignment.dueDate),
      maxScore: assignment.maxScore,
      linkTitle: link.title,
      linkUrl: link.url,
    });
    setAssignmentFile(null);
  };

  const resetJournalForm = () => {
    setEditingJournalId(null);
    setJournalForm(emptyJournalForm);
    setAttendanceForm({});
    setGradeForm({});
  };

  const startEditJournal = (entry: LessonJournalEntry) => {
    const nextAttendance: Record<
      string,
      { status: AttendanceStatus; comment: string }
    > = {};
    for (const item of entry.attendance) {
      nextAttendance[item.studentId] = {
        status: item.status,
        comment: item.comment ?? '',
      };
    }

    const nextGrades: Record<string, { value: string; comment: string }> = {};
    for (const grade of entry.grades) {
      nextGrades[grade.studentId] = {
        value: String(grade.value),
        comment: grade.comment ?? '',
      };
    }

    setEditingJournalId(entry.id);
    setJournalForm({
      scheduleEntryId: entry.scheduleEntryId ?? '',
      date: entry.date.slice(0, 10),
      startTime: entry.startTime ?? '',
      endTime: entry.endTime ?? '',
      type: entry.type ?? 'lecture',
      topic: entry.topic,
      description: entry.description ?? '',
    });
    setAttendanceForm(nextAttendance);
    setGradeForm(nextGrades);
  };

  const startEditGrade = (grade: Grade) => {
    setEditingGradeId(grade.id);
    setGradeEditForm({
      type: grade.type,
      value: String(grade.value),
      comment: grade.comment ?? '',
    });
  };

  const handleMaterialSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    void saveMaterialMutation.mutateAsync();
  };

  const handleAssignmentSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    void saveAssignmentMutation.mutateAsync();
  };

  const handleJournalSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    void saveJournalMutation.mutateAsync();
  };

  const handleSchedulePick = (event: ChangeEvent<HTMLSelectElement>) => {
    const scheduleEntryId = event.target.value;
    const entry = scheduleEntries.find((item) => item.id === scheduleEntryId);

    setJournalForm((current) => ({
      ...current,
      scheduleEntryId,
      date: entry?.date ?? current.date,
      startTime: entry?.startTime ?? current.startTime,
      endTime: entry?.endTime ?? current.endTime,
      type: entry?.type ?? current.type,
    }));
  };

  const handleDownload = async (fileId: string, originalName: string) => {
    const response = await api.get(`/files/download/${fileId}`, {
      responseType: 'blob',
    });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', originalName);
    document.body.appendChild(link);
    link.click();
    link.parentNode?.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const dateLabel = (value?: string) =>
    value ? new Date(value).toLocaleDateString(locale) : '-';

  if (isLoadingCourse) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
      </div>
    );
  }

  if (courseError || !course) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
        {t('courses.notFound')}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <Link
            to="/courses"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
            title={t('common.back')}>
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {course.courseName}
            </h1>
            <p className="text-sm text-slate-500">
              {course.courseCode} · {course.academicYear}, {course.semester}{' '}
              {t('courses.semester')}
            </p>
          </div>
        </div>
      </div>

      {statusMessage && (
        <div className="flex items-center justify-between rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <span>{statusMessage}</span>
          <button
            type="button"
            className="text-blue-700 underline-offset-4 hover:underline"
            onClick={() => setStatusMessage('')}>
            {t('teacherCourse.common.close')}
          </button>
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-6 py-4">
          <div className="grid gap-3 text-sm md:grid-cols-4">
            <InfoLine label={t('courses.teacher')} value={formatTeacherName(course)} />
            <InfoLine label={t('courses.group')} value={course.groupCode} />
            <InfoLine label={t('courses.credits')} value={String(course.credits ?? '-')} />
            <InfoLine
              label={t('courses.semester')}
              value={`${course.academicYear}, ${course.semester}`}
            />
          </div>
        </div>

        <div className="border-b border-slate-200 px-6">
          <nav className="flex flex-wrap gap-2 py-3">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium transition ${
                    active
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-white text-slate-600 hover:bg-slate-100'
                  }`}>
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'materials' && (
            <MaterialsTab
              teacherMode={teacherMode}
              form={materialForm}
              setForm={setMaterialForm}
              setFile={setMaterialFile}
              file={materialFile}
              loading={isLoadingMaterials}
              materials={materialsData?.docs ?? []}
              dateLabel={dateLabel}
              onSubmit={handleMaterialSubmit}
              onDownload={handleDownload}
              onDelete={(materialId) => deleteMaterialMutation.mutate(materialId)}
              onEdit={startEditMaterial}
              onCancelEdit={resetMaterialForm}
              editingId={editingMaterialId}
              saving={saveMaterialMutation.isPending}
            />
          )}

          {activeTab === 'assignments' && (
            <AssignmentsTab
              teacherMode={teacherMode}
              form={assignmentForm}
              setForm={setAssignmentForm}
              setFile={setAssignmentFile}
              file={assignmentFile}
              assignments={assignmentsData?.docs ?? []}
              loading={isLoadingAssignments}
              dateLabel={dateLabel}
              onSubmit={handleAssignmentSubmit}
              onDownload={handleDownload}
              onEdit={startEditAssignment}
              onDelete={(assignmentId) =>
                deleteAssignmentMutation.mutate(assignmentId)
              }
              onCancelEdit={resetAssignmentForm}
              editingId={editingAssignmentId}
              saving={saveAssignmentMutation.isPending}
            />
          )}

          {activeTab === 'students' && (
            <StudentsTab students={students} loading={isLoadingStudents} />
          )}

          {activeTab === 'journal' && (
            <JournalTab
              students={students}
              entries={journalData?.docs ?? []}
              scheduleEntries={scheduleEntries}
              form={journalForm}
              setForm={setJournalForm}
              attendanceForm={attendanceForm}
              setAttendanceForm={setAttendanceForm}
              gradeForm={gradeForm}
              setGradeForm={setGradeForm}
              loading={isLoadingJournal || isLoadingStudents}
              saving={saveJournalMutation.isPending}
              dateLabel={dateLabel}
              onSchedulePick={handleSchedulePick}
              onSubmit={handleJournalSubmit}
              onEdit={startEditJournal}
              onDelete={(journalId) => deleteJournalMutation.mutate(journalId)}
              onCancelEdit={resetJournalForm}
              editingId={editingJournalId}
            />
          )}

          {activeTab === 'grades' && (
            <GradesTab
              rows={gradesData?.docs ?? []}
              loading={isLoadingGrades}
              dateLabel={dateLabel}
              editingGradeId={editingGradeId}
              gradeEditForm={gradeEditForm}
              setGradeEditForm={setGradeEditForm}
              onEditGrade={startEditGrade}
              onCancelEdit={() => {
                setEditingGradeId(null);
                setGradeEditForm(emptyGradeEditForm);
              }}
              onSaveGrade={() => void updateGradeMutation.mutateAsync()}
              onDeleteGrade={(gradeId) => deleteGradeMutation.mutate(gradeId)}
              saving={updateGradeMutation.isPending}
            />
          )}
        </div>
      </section>
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 font-medium text-slate-900">{value || '-'}</div>
    </div>
  );
}

function FileInput({
  file,
  onChange,
}: {
  file: File | null;
  onChange: (file: File | null) => void;
}) {
  const { t } = useTranslation();

  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50">
      <Upload className="h-4 w-4" />
      <span className="truncate">
        {file?.name ?? t('teacherCourse.common.file')}
      </span>
      <input
        type="file"
        className="sr-only"
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
      />
    </label>
  );
}

function ResourceLinkFields({
  title,
  url,
  onTitleChange,
  onUrlChange,
}: {
  title: string;
  url: string;
  onTitleChange: (value: string) => void;
  onUrlChange: (value: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <input
        type="text"
        value={title}
        onChange={(event) => onTitleChange(event.target.value)}
        placeholder={t('teacherCourse.common.linkTitle')}
        className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-500"
      />
      <input
        type="url"
        value={url}
        onChange={(event) => onUrlChange(event.target.value)}
        placeholder={t('teacherCourse.common.linkUrl')}
        className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-500"
      />
    </div>
  );
}

function MaterialsTab({
  teacherMode,
  form,
  setForm,
  file,
  setFile,
  loading,
  materials,
  dateLabel,
  onSubmit,
  onDownload,
  onDelete,
  onEdit,
  onCancelEdit,
  editingId,
  saving,
}: {
  teacherMode: boolean;
  form: typeof emptyMaterialForm;
  setForm: (value: typeof emptyMaterialForm) => void;
  file: File | null;
  setFile: (file: File | null) => void;
  loading: boolean;
  materials: Material[];
  dateLabel: (value?: string) => string;
  onSubmit: (event: SyntheticEvent<HTMLFormElement>) => void;
  onDownload: (fileId: string, originalName: string) => Promise<void>;
  onDelete: (materialId: string) => void;
  onEdit: (material: Material) => void;
  onCancelEdit: () => void;
  editingId: string | null;
  saving: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      {teacherMode && (
        <form
          onSubmit={onSubmit}
          className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-900">
              {editingId
                ? t('teacherCourse.materials.formEdit')
                : t('teacherCourse.materials.formCreate')}
            </h2>
            {editingId && (
              <button
                type="button"
                onClick={onCancelEdit}
                className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50">
                <X className="h-4 w-4" />
                {t('teacherCourse.common.cancel')}
              </button>
            )}
          </div>
          <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_240px]">
            <input
              type="text"
              required
              maxLength={160}
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              placeholder={t('teacherCourse.materials.titlePlaceholder')}
              className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-500"
            />
            <select
              value={form.category}
              onChange={(event) =>
                setForm({
                  ...form,
                  category: event.target.value as MaterialCategory,
                })
              }
              className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-500">
              {MATERIAL_CATEGORY_VALUES.map((category) => (
                <option key={category} value={category}>
                  {t(`teacherCourse.materialCategories.${category}`)}
                </option>
              ))}
            </select>
          </div>
          <textarea
            value={form.description}
            onChange={(event) =>
              setForm({ ...form, description: event.target.value })
            }
            placeholder={t('teacherCourse.materials.descriptionPlaceholder')}
            className="min-h-24 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500"
          />
          <ResourceLinkFields
            title={form.linkTitle}
            url={form.linkUrl}
            onTitleChange={(value) => setForm({ ...form, linkTitle: value })}
            onUrlChange={(value) => setForm({ ...form, linkUrl: value })}
          />
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
            <FileInput file={file} onChange={setFile} />
            <button
              type="submit"
              disabled={saving}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:bg-slate-300">
              <Save className="h-4 w-4" />
              {editingId
                ? t('teacherCourse.materials.update')
                : t('teacherCourse.materials.save')}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <EmptyState text={t('teacherCourse.materials.loading')} />
      ) : materials.length === 0 ? (
        <EmptyState text={t('teacherCourse.materials.empty')} />
      ) : (
        <div className="grid gap-3">
          {materials.map((material) => (
            <article
              key={material.id}
              className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-blue-600">
                    {t(
                      `teacherCourse.materialCategories.${
                        material.category ?? 'other'
                      }`,
                    )}
                  </div>
                  <h3 className="mt-1 font-semibold text-slate-900">
                    {material.title}
                  </h3>
                  {material.description && (
                    <p className="mt-1 text-sm text-slate-500">
                      {material.description}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-slate-400">
                    {dateLabel(material.publishDate)}
                  </p>
                </div>
                {teacherMode && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => onEdit(material)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50"
                      title={t('teacherCourse.common.edit')}>
                      <Edit3 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(material.id)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-100 text-red-600 transition hover:bg-red-50"
                      title={t('teacherCourse.common.delete')}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
              <ResourceList
                files={material.files ?? []}
                resourceLinks={material.resourceLinks ?? []}
                onDownload={onDownload}
              />
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function AssignmentsTab({
  teacherMode,
  form,
  setForm,
  file,
  setFile,
  assignments,
  loading,
  dateLabel,
  onSubmit,
  onDownload,
  onEdit,
  onDelete,
  onCancelEdit,
  editingId,
  saving,
}: {
  teacherMode: boolean;
  form: typeof emptyAssignmentForm;
  setForm: (value: typeof emptyAssignmentForm) => void;
  file: File | null;
  setFile: (file: File | null) => void;
  assignments: Assignment[];
  loading: boolean;
  dateLabel: (value?: string) => string;
  onSubmit: (event: SyntheticEvent<HTMLFormElement>) => void;
  onDownload: (fileId: string, originalName: string) => Promise<void>;
  onEdit: (assignment: Assignment) => void;
  onDelete: (assignmentId: string) => void;
  onCancelEdit: () => void;
  editingId: string | null;
  saving: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      {teacherMode && (
        <form
          onSubmit={onSubmit}
          className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-900">
              {editingId
                ? t('teacherCourse.assignments.formEdit')
                : t('teacherCourse.assignments.formCreate')}
            </h2>
            {editingId && (
              <button
                type="button"
                onClick={onCancelEdit}
                className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50">
                <X className="h-4 w-4" />
                {t('teacherCourse.common.cancel')}
              </button>
            )}
          </div>
          <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_180px_160px]">
            <input
              type="text"
              required
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              placeholder={t('teacherCourse.assignments.titlePlaceholder')}
              className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-500"
            />
            <input
              type="datetime-local"
              required
              value={form.dueDate}
              onChange={(event) =>
                setForm({ ...form, dueDate: event.target.value })
              }
              className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-500"
            />
            <input
              type="number"
              min={1}
              max={100}
              required
              value={form.maxScore}
              onChange={(event) =>
                setForm({ ...form, maxScore: Number(event.target.value) })
              }
              className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-500"
            />
          </div>
          <textarea
            required
            value={form.description}
            onChange={(event) =>
              setForm({ ...form, description: event.target.value })
            }
            placeholder={t('teacherCourse.assignments.descriptionPlaceholder')}
            className="min-h-24 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500"
          />
          <textarea
            value={form.criteria}
            onChange={(event) =>
              setForm({ ...form, criteria: event.target.value })
            }
            placeholder={t('teacherCourse.assignments.criteriaPlaceholder')}
            className="min-h-24 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500"
          />
          <ResourceLinkFields
            title={form.linkTitle}
            url={form.linkUrl}
            onTitleChange={(value) => setForm({ ...form, linkTitle: value })}
            onUrlChange={(value) => setForm({ ...form, linkUrl: value })}
          />
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
            <FileInput file={file} onChange={setFile} />
            <button
              type="submit"
              disabled={saving}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:bg-slate-300">
              <Plus className="h-4 w-4" />
              {editingId
                ? t('teacherCourse.assignments.update')
                : t('teacherCourse.assignments.publish')}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <EmptyState text={t('teacherCourse.assignments.loading')} />
      ) : assignments.length === 0 ? (
        <EmptyState text={t('teacherCourse.assignments.empty')} />
      ) : (
        <div className="grid gap-3">
          {assignments.map((assignment) => (
            <article
              key={assignment.id}
              className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-col gap-3 md:flex-row md:justify-between">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-slate-900">
                    {assignment.title}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {assignment.description}
                  </p>
                  {assignment.criteria && (
                    <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                      {assignment.criteria}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-2 md:items-end">
                  {teacherMode && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => onEdit(assignment)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50"
                        title={t('teacherCourse.common.edit')}>
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(assignment.id)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-100 text-red-600 transition hover:bg-red-50"
                        title={t('teacherCourse.common.delete')}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                  <div className="min-w-36 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
                    <div className="text-xs text-blue-500">
                      {t('teacherCourse.assignments.deadline')}
                    </div>
                    <div className="font-semibold">
                      {dateLabel(assignment.dueDate)}
                    </div>
                    <div className="mt-1 text-xs text-blue-500">
                      {t('teacherCourse.assignments.points', {
                        count: assignment.maxScore,
                      })}
                    </div>
                  </div>
                </div>
              </div>
              <ResourceList
                files={assignment.files ?? []}
                resourceLinks={assignment.resourceLinks ?? []}
                onDownload={onDownload}
              />
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function StudentsTab({
  students,
  loading,
}: {
  students: User[];
  loading: boolean;
}) {
  const { t } = useTranslation();

  if (loading) return <EmptyState text={t('teacherCourse.students.loading')} />;
  if (students.length === 0) {
    return <EmptyState text={t('teacherCourse.students.empty')} />;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200">
        <thead className="bg-slate-50">
          <tr>
            <TableHead>{t('teacherCourse.students.fullName')}</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>{t('teacherCourse.students.recordBook')}</TableHead>
            <TableHead>{t('teacherCourse.students.status')}</TableHead>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white">
          {students.map((student) => (
            <tr key={student.id}>
              <TableCell strong>{formatUserName(student)}</TableCell>
              <TableCell>{student.email}</TableCell>
              <TableCell>{student.studentProfile?.recordBookNumber ?? '-'}</TableCell>
              <TableCell>{student.status}</TableCell>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function JournalTab({
  students,
  entries,
  scheduleEntries,
  form,
  setForm,
  attendanceForm,
  setAttendanceForm,
  gradeForm,
  setGradeForm,
  loading,
  saving,
  dateLabel,
  onSchedulePick,
  onSubmit,
  onEdit,
  onDelete,
  onCancelEdit,
  editingId,
}: {
  students: User[];
  entries: LessonJournalEntry[];
  scheduleEntries: ScheduleEntry[];
  form: typeof emptyJournalForm;
  setForm: (value: typeof emptyJournalForm) => void;
  attendanceForm: Record<string, { status: AttendanceStatus; comment: string }>;
  setAttendanceForm: (
    value: Record<string, { status: AttendanceStatus; comment: string }>,
  ) => void;
  gradeForm: Record<string, { value: string; comment: string }>;
  setGradeForm: (value: Record<string, { value: string; comment: string }>) => void;
  loading: boolean;
  saving: boolean;
  dateLabel: (value?: string) => string;
  onSchedulePick: (event: ChangeEvent<HTMLSelectElement>) => void;
  onSubmit: (event: SyntheticEvent<HTMLFormElement>) => void;
  onEdit: (entry: LessonJournalEntry) => void;
  onDelete: (entryId: string) => void;
  onCancelEdit: () => void;
  editingId: string | null;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <form
        onSubmit={onSubmit}
        className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900">
            {editingId
              ? t('teacherCourse.journal.formEdit')
              : t('teacherCourse.journal.formCreate')}
          </h2>
          {editingId && (
            <button
              type="button"
              onClick={onCancelEdit}
              className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50">
              <X className="h-4 w-4" />
              {t('teacherCourse.common.cancel')}
            </button>
          )}
        </div>
        <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_160px_130px_130px_150px]">
          <select
            value={form.scheduleEntryId}
            onChange={onSchedulePick}
            className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-500">
            <option value="">{t('teacherCourse.journal.noSchedule')}</option>
            {scheduleEntries.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.date} {entry.startTime}-{entry.endTime} ·{' '}
                {t(`teacherCourse.lessonTypes.${entry.type}`)}
              </option>
            ))}
          </select>
          <input
            type="date"
            required
            value={form.date}
            onChange={(event) => setForm({ ...form, date: event.target.value })}
            className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-500"
          />
          <input
            type="time"
            value={form.startTime}
            onChange={(event) =>
              setForm({ ...form, startTime: event.target.value })
            }
            className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-500"
          />
          <input
            type="time"
            value={form.endTime}
            onChange={(event) => setForm({ ...form, endTime: event.target.value })}
            className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-500"
          />
          <select
            value={form.type}
            onChange={(event) => setForm({ ...form, type: event.target.value })}
            className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-500">
            {LESSON_TYPE_VALUES.map((value) => (
              <option key={value} value={value}>
                {t(`teacherCourse.lessonTypes.${value}`)}
              </option>
            ))}
          </select>
        </div>
        <input
          type="text"
          required
          maxLength={300}
          value={form.topic}
          onChange={(event) => setForm({ ...form, topic: event.target.value })}
          placeholder={t('teacherCourse.journal.topicPlaceholder')}
          className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-500"
        />
        <textarea
          value={form.description}
          onChange={(event) =>
            setForm({ ...form, description: event.target.value })
          }
          placeholder={t('teacherCourse.journal.notesPlaceholder')}
          className="min-h-20 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500"
        />

        {students.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <TableHead>{t('teacherCourse.journal.student')}</TableHead>
                  <TableHead>{t('teacherCourse.journal.attendance')}</TableHead>
                  <TableHead>
                    {t('teacherCourse.journal.attendanceComment')}
                  </TableHead>
                  <TableHead>{t('teacherCourse.journal.currentGrade')}</TableHead>
                  <TableHead>{t('teacherCourse.journal.gradeComment')}</TableHead>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {students.map((student) => (
                  <tr key={student.id}>
                    <TableCell strong>{formatUserName(student)}</TableCell>
                    <TableCell>
                      <select
                        value={attendanceForm[student.id]?.status ?? 'present'}
                        onChange={(event) =>
                          setAttendanceForm({
                            ...attendanceForm,
                            [student.id]: {
                              status: event.target.value as AttendanceStatus,
                              comment: attendanceForm[student.id]?.comment ?? '',
                            },
                          })
                        }
                        className="min-h-10 w-full rounded-lg border border-slate-300 px-2 text-sm outline-none focus:border-blue-500">
                        {ATTENDANCE_STATUS_VALUES.map((value) => (
                          <option key={value} value={value}>
                            {t(`teacherCourse.attendance.${value}`)}
                          </option>
                        ))}
                      </select>
                    </TableCell>
                    <TableCell>
                      <input
                        type="text"
                        value={attendanceForm[student.id]?.comment ?? ''}
                        onChange={(event) =>
                          setAttendanceForm({
                            ...attendanceForm,
                            [student.id]: {
                              status:
                                attendanceForm[student.id]?.status ?? 'present',
                              comment: event.target.value,
                            },
                          })
                        }
                        className="min-h-10 w-full rounded-lg border border-slate-300 px-2 text-sm outline-none focus:border-blue-500"
                      />
                    </TableCell>
                    <TableCell>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={gradeForm[student.id]?.value ?? ''}
                        onChange={(event) =>
                          setGradeForm({
                            ...gradeForm,
                            [student.id]: {
                              value: event.target.value,
                              comment: gradeForm[student.id]?.comment ?? '',
                            },
                          })
                        }
                        className="min-h-10 w-24 rounded-lg border border-slate-300 px-2 text-sm outline-none focus:border-blue-500"
                      />
                    </TableCell>
                    <TableCell>
                      <input
                        type="text"
                        value={gradeForm[student.id]?.comment ?? ''}
                        onChange={(event) =>
                          setGradeForm({
                            ...gradeForm,
                            [student.id]: {
                              value: gradeForm[student.id]?.value ?? '',
                              comment: event.target.value,
                            },
                          })
                        }
                        className="min-h-10 w-full rounded-lg border border-slate-300 px-2 text-sm outline-none focus:border-blue-500"
                      />
                    </TableCell>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <button
          type="submit"
          disabled={saving || students.length === 0}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:bg-slate-300 md:w-auto md:justify-self-end">
          <Save className="h-4 w-4" />
          {editingId
            ? t('teacherCourse.journal.update')
            : t('teacherCourse.journal.save')}
        </button>
      </form>

      {loading ? (
        <EmptyState text={t('teacherCourse.journal.loading')} />
      ) : entries.length === 0 ? (
        <EmptyState text={t('teacherCourse.journal.empty')} />
      ) : (
        <div className="grid gap-3">
          {entries.map((entry) => (
            <article
              key={entry.id}
              className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-col gap-3 md:flex-row md:justify-between">
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-blue-600">
                    {dateLabel(entry.date)} ·{' '}
                    {entry.type
                      ? t(`teacherCourse.lessonTypes.${entry.type}`)
                      : '-'}
                  </div>
                  <h3 className="mt-1 font-semibold text-slate-900">
                    {entry.topic}
                  </h3>
                  {entry.description && (
                    <p className="mt-1 text-sm text-slate-500">
                      {entry.description}
                    </p>
                  )}
                </div>
                <div className="text-sm text-slate-500">
                  <div>
                    {entry.startTime || '--:--'}-{entry.endTime || '--:--'}
                  </div>
                  <div className="mt-2 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => onEdit(entry)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50"
                      title={t('teacherCourse.common.edit')}>
                      <Edit3 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(entry.id)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-100 text-red-600 transition hover:bg-red-50"
                      title={t('teacherCourse.common.delete')}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <CompactList
                  title={t('teacherCourse.journal.attendance')}
                  items={entry.attendance.map(
                    (item) =>
                      `${item.studentName}: ${t(
                        `teacherCourse.attendance.${item.status}`,
                      )}`,
                  )}
                />
                <CompactList
                  title={t('courses.tabs.grades')}
                  items={entry.grades.map(
                    (grade) => `${grade.studentName}: ${grade.value}`,
                  )}
                />
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function GradesTab({
  rows,
  loading,
  dateLabel,
  editingGradeId,
  gradeEditForm,
  setGradeEditForm,
  onEditGrade,
  onCancelEdit,
  onSaveGrade,
  onDeleteGrade,
  saving,
}: {
  rows: GradeJournalResponse[];
  loading: boolean;
  dateLabel: (value?: string) => string;
  editingGradeId: string | null;
  gradeEditForm: typeof emptyGradeEditForm;
  setGradeEditForm: (value: typeof emptyGradeEditForm) => void;
  onEditGrade: (grade: Grade) => void;
  onCancelEdit: () => void;
  onSaveGrade: () => void;
  onDeleteGrade: (gradeId: string) => void;
  saving: boolean;
}) {
  const { t } = useTranslation();

  if (loading) return <EmptyState text={t('teacherCourse.grades.loading')} />;
  if (rows.length === 0) {
    return <EmptyState text={t('teacherCourse.grades.empty')} />;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200">
        <thead className="bg-slate-50">
          <tr>
            <TableHead>{t('teacherCourse.grades.student')}</TableHead>
            <TableHead>{t('grades.date')}</TableHead>
            <TableHead>{t('grades.type')}</TableHead>
            <TableHead>{t('grades.grade')}</TableHead>
            <TableHead>{t('grades.comment')}</TableHead>
            <TableHead>{t('teacherCourse.common.actions')}</TableHead>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white">
          {rows.flatMap((row) =>
            row.grades.length > 0 ? (
              row.grades.map((grade) => {
                const isEditing = editingGradeId === grade.id;

                return (
                  <tr key={grade.id}>
                    <TableCell strong>{row.studentName}</TableCell>
                    <TableCell>{dateLabel(grade.date)}</TableCell>
                    <TableCell>
                      {isEditing ? (
                        <select
                          value={gradeEditForm.type}
                          onChange={(event) =>
                            setGradeEditForm({
                              ...gradeEditForm,
                              type: event.target.value,
                            })
                          }
                          className="min-h-10 rounded-lg border border-slate-300 px-2 text-sm outline-none focus:border-blue-500">
                          {GRADE_TYPE_VALUES.map((type) => (
                            <option key={type} value={type}>
                              {t(`grades.types.${type}`)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        t(`grades.types.${grade.type}`)
                      )}
                    </TableCell>
                    <TableCell strong>
                      {isEditing ? (
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={gradeEditForm.value}
                          onChange={(event) =>
                            setGradeEditForm({
                              ...gradeEditForm,
                              value: event.target.value,
                            })
                          }
                          className="min-h-10 w-24 rounded-lg border border-slate-300 px-2 text-sm outline-none focus:border-blue-500"
                        />
                      ) : (
                        grade.value
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <input
                          type="text"
                          value={gradeEditForm.comment}
                          onChange={(event) =>
                            setGradeEditForm({
                              ...gradeEditForm,
                              comment: event.target.value,
                            })
                          }
                          className="min-h-10 w-full rounded-lg border border-slate-300 px-2 text-sm outline-none focus:border-blue-500"
                        />
                      ) : (
                        grade.comment || '-'
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              onClick={onSaveGrade}
                              disabled={saving || !gradeEditForm.value}
                              className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white transition hover:bg-blue-700 disabled:bg-slate-300">
                              <Save className="h-4 w-4" />
                              {t('teacherCourse.grades.save')}
                            </button>
                            <button
                              type="button"
                              onClick={onCancelEdit}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50"
                              title={t('teacherCourse.common.cancel')}>
                              <X className="h-4 w-4" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => onEditGrade(grade)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50"
                              title={t('teacherCourse.common.edit')}>
                              <Edit3 className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteGrade(grade.id)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-100 text-red-600 transition hover:bg-red-50"
                              title={t('teacherCourse.common.delete')}>
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </tr>
                );
              })
            ) : (
              <tr key={row.studentId}>
                <TableCell strong>{row.studentName}</TableCell>
                <TableCell>-</TableCell>
                <TableCell>-</TableCell>
                <TableCell>-</TableCell>
                <TableCell>-</TableCell>
                <TableCell>-</TableCell>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}

function ResourceList({
  files,
  resourceLinks,
  onDownload,
}: {
  files: Array<{ id: string; _id?: string; originalName: string }>;
  resourceLinks: Array<{ title: string; url: string }>;
  onDownload: (fileId: string, originalName: string) => Promise<void>;
}) {
  if (files.length === 0 && resourceLinks.length === 0) return null;

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {files.map((file) => {
        const fileId = file.id || file._id;
        if (!fileId) return null;

        return (
          <button
            key={fileId}
            type="button"
            onClick={() => void onDownload(fileId, file.originalName)}
            className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-slate-100 px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-200">
            <Download className="h-4 w-4" />
            {file.originalName}
          </button>
        );
      })}
      {resourceLinks.map((link) => (
        <a
          key={`${link.title}-${link.url}`}
          href={link.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-blue-50 px-3 text-sm font-medium text-blue-700 transition hover:bg-blue-100">
          <LinkIcon className="h-4 w-4" />
          {link.title}
        </a>
      ))}
    </div>
  );
}

function CompactList({ title, items }: { title: string; items: string[] }) {
  const { t } = useTranslation();

  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </h4>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-slate-400">
          {t('teacherCourse.common.noData')}
        </p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm text-slate-700">
          {items.slice(0, 6).map((item) => (
            <li key={item}>{item}</li>
          ))}
          {items.length > 6 && (
            <li className="text-slate-400">+{items.length - 6}</li>
          )}
        </ul>
      )}
    </div>
  );
}

function TableHead({ children }: { children: string }) {
  return (
    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
      {children}
    </th>
  );
}

function TableCell({
  children,
  strong = false,
}: {
  children: ReactNode;
  strong?: boolean;
}) {
  return (
    <td
      className={`px-4 py-3 text-sm ${
        strong ? 'font-semibold text-slate-900' : 'text-slate-600'
      }`}>
      {children}
    </td>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
      {text}
    </div>
  );
}
