import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GroupReference } from '../../types';
import {
  addSpecialty,
  groupsByCourse,
  isCourseFullySelected,
  listCourses,
  listSpecialties,
  selectAll,
  toggleCourse,
  toggleGroup,
} from './groupQuickSelect';

interface TargetGroupsPickerProps {
  groups: GroupReference[];
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}

const buttonClass =
  'rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60';
const activeButtonClass = 'border-blue-500 bg-blue-50 text-blue-700';

export default function TargetGroupsPicker({
  groups,
  value,
  onChange,
  disabled = false,
}: TargetGroupsPickerProps) {
  const { t } = useTranslation();
  const [specialtyId, setSpecialtyId] = useState('');
  const courses = listCourses(groups);
  const specialties = listSpecialties(groups);

  return (
    <div className="space-y-2 text-sm text-slate-600">
      <div className="flex items-center justify-between gap-2">
        <span>{t('electives.groups')}</span>
        <span>{t('electives.admin.groups.selected', { count: value.length })}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(selectAll(groups))}
          className={buttonClass}
        >
          {t('electives.admin.groups.all')}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange([])}
          className={buttonClass}
        >
          {t('electives.admin.groups.clear')}
        </button>

        {courses.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span>{t('electives.admin.groups.course')}:</span>
            {courses.map((course) => {
              const pressed = isCourseFullySelected(value, groups, course);
              return (
                <button
                  key={course}
                  type="button"
                  disabled={disabled}
                  aria-pressed={pressed}
                  aria-label={`${t('electives.admin.groups.course')} ${course}`}
                  onClick={() => onChange(toggleCourse(value, groups, course))}
                  className={`${buttonClass} ${pressed ? activeButtonClass : ''}`}
                >
                  {course}
                </button>
              );
            })}
          </div>
        )}

        {specialties.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="target-groups-specialty">
              {t('electives.admin.groups.specialty')}:
            </label>
            <select
              id="target-groups-specialty"
              value={specialtyId}
              disabled={disabled}
              onChange={(event) => setSpecialtyId(event.currentTarget.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="" />
              {specialties.map((specialty) => (
                <option key={specialty.id} value={specialty.id}>
                  {specialty.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={disabled || !specialtyId}
              onClick={() => onChange(addSpecialty(value, groups, specialtyId))}
              className={buttonClass}
            >
              {t('electives.admin.groups.add')}
            </button>
          </div>
        )}
      </div>

      <div className="max-h-64 space-y-2 overflow-y-auto">
        {groupsByCourse(groups).map(({ course, groups: courseGroups }) => (
          <div key={course} className="flex flex-wrap items-center gap-2">
            <span className="w-16 shrink-0 font-medium">
              {t('electives.admin.groups.courseRow', { course })}
            </span>
            {courseGroups.map((group) => (
              <label key={group.id} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={value.includes(group.id)}
                  disabled={disabled}
                  onChange={() => onChange(toggleGroup(value, group.id))}
                />
                {group.code}
              </label>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
