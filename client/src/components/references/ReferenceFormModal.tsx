import { X } from "lucide-react";
import { useState } from "react";
import type { ChangeEvent, SyntheticEvent } from "react";
import { useTranslation } from "react-i18next";
import { useAutoDismissState } from "../../hooks/useAutoDismissState";
import type { User } from "../../types";
import {
  ReferenceType,
  type ClassroomReference,
  type DepartmentReference,
  type FacultyReference,
  type GroupReference,
  type ReferencePayload,
  type ReferenceRecord,
  type SpecialtyReference,
} from "../../services/referencesApi";

type FormState = {
  name: string;
  code: string;
  dean: string;
  faculty: string;
  head: string;
  specialty: string;
  course: string;
  curator: string;
  building: string;
  roomNumber: string;
  capacity: string;
  classroomType: string;
};

interface ReferenceFormOptions {
  faculties: FacultyReference[];
  specialties: SpecialtyReference[];
  deans: User[];
  departmentHeads: User[];
  curators: User[];
}

interface Props {
  type: ReferenceType;
  record?: ReferenceRecord | null;
  options: ReferenceFormOptions;
  onClose: () => void;
  onSubmit: (payload: ReferencePayload) => Promise<void>;
}

function referenceId(value: { id: string } | string | undefined) {
  return typeof value === "string" ? value : (value?.id ?? "");
}

function buildInitialState(
  type: ReferenceType,
  record?: ReferenceRecord | null,
): FormState {
  const base: FormState = {
    name: "",
    code: "",
    dean: "",
    faculty: "",
    head: "",
    specialty: "",
    course: "1",
    curator: "",
    building: "",
    roomNumber: "",
    capacity: "30",
    classroomType: "lecture",
  };
  if (!record) return base;

  switch (type) {
    case ReferenceType.FACULTIES: {
      const faculty = record as FacultyReference;
      return {
        ...base,
        name: faculty.name,
        dean: referenceId(faculty.dean),
      };
    }
    case ReferenceType.DEPARTMENTS: {
      const department = record as DepartmentReference;
      return {
        ...base,
        name: department.name,
        faculty: referenceId(department.faculty),
        head: referenceId(department.head),
      };
    }
    case ReferenceType.SPECIALTIES: {
      const specialty = record as SpecialtyReference;
      return { ...base, name: specialty.name, code: specialty.code };
    }
    case ReferenceType.GROUPS: {
      const group = record as GroupReference;
      return {
        ...base,
        code: group.code,
        specialty: referenceId(group.specialty),
        course: String(group.course),
        curator: referenceId(group.curator),
      };
    }
    case ReferenceType.CLASSROOMS: {
      const classroom = record as ClassroomReference;
      return {
        ...base,
        building: classroom.building,
        roomNumber: classroom.roomNumber,
        capacity: String(classroom.capacity),
        classroomType: classroom.type,
      };
    }
  }
}

function userName(user: User) {
  return [user.lastName, user.firstName, user.middleName]
    .filter(Boolean)
    .join(" ");
}

export default function ReferenceFormModal({
  type,
  record,
  options,
  onClose,
  onSubmit,
}: Props) {
  const { t } = useTranslation();
  const [form, setForm] = useState(() => buildInitialState(type, record));
  const [error, setError] = useAutoDismissState("");
  const [saving, setSaving] = useState(false);

  const handleChange = (
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = event.currentTarget;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const buildPayload = (): ReferencePayload => {
    switch (type) {
      case ReferenceType.FACULTIES:
        return {
          name: form.name.trim(),
          dean: form.dean || (record ? null : undefined),
        };
      case ReferenceType.DEPARTMENTS:
        return {
          name: form.name.trim(),
          faculty: form.faculty,
          head: form.head || (record ? null : undefined),
        };
      case ReferenceType.SPECIALTIES:
        return {
          code: form.code.trim().toUpperCase(),
          name: form.name.trim(),
        };
      case ReferenceType.GROUPS:
        return {
          code: form.code.trim().toUpperCase(),
          specialty: form.specialty,
          course: Number(form.course),
          curator: form.curator || (record ? null : undefined),
        };
      case ReferenceType.CLASSROOMS:
        return {
          building: form.building.trim(),
          roomNumber: form.roomNumber.trim(),
          capacity: Number(form.capacity),
          type: form.classroomType,
        };
    }
  };

  const handleSubmit = async (
    event: SyntheticEvent<HTMLFormElement, SubmitEvent>,
  ) => {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      await onSubmit(buildPayload());
    } catch {
      setError(t("references.form.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reference-form-title"
        className="w-full max-w-2xl rounded-lg bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2
            id="reference-form-title"
            className="text-lg font-semibold text-slate-900"
          >
            {record
              ? t("references.form.editTitle")
              : t("references.form.createTitle")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
            aria-label={t("references.form.close")}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          {(type === ReferenceType.FACULTIES ||
            type === ReferenceType.DEPARTMENTS ||
            type === ReferenceType.SPECIALTIES) && (
            <label className="block text-sm font-medium text-slate-700">
              {t("references.fields.name")}
              <input
                required
                name="name"
                value={form.name}
                onChange={handleChange}
                maxLength={160}
                className={`${inputClass} mt-1.5`}
              />
            </label>
          )}

          {(type === ReferenceType.SPECIALTIES ||
            type === ReferenceType.GROUPS) && (
            <label className="block text-sm font-medium text-slate-700">
              {t("references.fields.code")}
              <input
                required
                name="code"
                value={form.code}
                onChange={handleChange}
                maxLength={32}
                className={`${inputClass} mt-1.5`}
              />
            </label>
          )}

          {type === ReferenceType.FACULTIES && (
            <label className="block text-sm font-medium text-slate-700">
              {t("references.fields.dean")}
              <select
                name="dean"
                value={form.dean}
                onChange={handleChange}
                className={`${inputClass} mt-1.5`}
              >
                <option value="">{t("references.form.notAssigned")}</option>
                {options.deans.map((user) => (
                  <option key={user.id} value={user.id}>
                    {userName(user)}
                  </option>
                ))}
              </select>
            </label>
          )}

          {type === ReferenceType.DEPARTMENTS && (
            <>
              <label className="block text-sm font-medium text-slate-700">
                {t("references.fields.faculty")}
                <select
                  required
                  name="faculty"
                  value={form.faculty}
                  onChange={handleChange}
                  className={`${inputClass} mt-1.5`}
                >
                  <option value="">{t("references.form.selectFaculty")}</option>
                  {options.faculties.map((faculty) => (
                    <option key={faculty.id} value={faculty.id}>
                      {faculty.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium text-slate-700">
                {t("references.fields.head")}
                <select
                  name="head"
                  value={form.head}
                  onChange={handleChange}
                  className={`${inputClass} mt-1.5`}
                >
                  <option value="">{t("references.form.notAssigned")}</option>
                  {options.departmentHeads.map((user) => (
                    <option key={user.id} value={user.id}>
                      {userName(user)}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          {type === ReferenceType.GROUPS && (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">
                {t("references.fields.specialty")}
                <select
                  required
                  name="specialty"
                  value={form.specialty}
                  onChange={handleChange}
                  className={`${inputClass} mt-1.5`}
                >
                  <option value="">
                    {t("references.form.selectSpecialty")}
                  </option>
                  {options.specialties.map((specialty) => (
                    <option key={specialty.id} value={specialty.id}>
                      {specialty.code} - {specialty.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium text-slate-700">
                {t("references.fields.course")}
                <input
                  required
                  type="number"
                  min={1}
                  max={12}
                  name="course"
                  value={form.course}
                  onChange={handleChange}
                  className={`${inputClass} mt-1.5`}
                />
              </label>
              <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
                {t("references.fields.curator")}
                <select
                  name="curator"
                  value={form.curator}
                  onChange={handleChange}
                  className={`${inputClass} mt-1.5`}
                >
                  <option value="">{t("references.form.notAssigned")}</option>
                  {options.curators.map((user) => (
                    <option key={user.id} value={user.id}>
                      {userName(user)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {type === ReferenceType.CLASSROOMS && (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">
                {t("references.fields.building")}
                <input
                  required
                  name="building"
                  value={form.building}
                  onChange={handleChange}
                  maxLength={80}
                  className={`${inputClass} mt-1.5`}
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                {t("references.fields.roomNumber")}
                <input
                  required
                  name="roomNumber"
                  value={form.roomNumber}
                  onChange={handleChange}
                  maxLength={32}
                  className={`${inputClass} mt-1.5`}
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                {t("references.fields.capacity")}
                <input
                  required
                  type="number"
                  min={1}
                  max={5000}
                  name="capacity"
                  value={form.capacity}
                  onChange={handleChange}
                  className={`${inputClass} mt-1.5`}
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                {t("references.fields.type")}
                <select
                  name="classroomType"
                  value={form.classroomType}
                  onChange={handleChange}
                  className={`${inputClass} mt-1.5`}
                >
                  {["lecture", "lab", "seminar", "online"].map((item) => (
                    <option key={item} value={item}>
                      {t(`references.classroomTypes.${item}`)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {t("references.form.cancel")}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="h-10 rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? t("references.form.saving") : t("references.form.save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
