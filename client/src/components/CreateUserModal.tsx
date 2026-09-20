import { useState, useEffect } from "react";
import type { ChangeEvent, SyntheticEvent } from "react";
import api from "../services/api";
import { Role, ROLE_LABEL_KEYS } from "../types";
import { useTranslation } from "react-i18next";
import { useAutoDismissState } from "../hooks/useAutoDismissState";
import { getLocalizedApiErrorMessage } from "../utils/apiErrorMessage";
import { Plus, Trash2 } from "lucide-react";
import {
  MAX_STUDENT_PROFILES,
  buildStudentProfilesPayload,
  emptyStudentProfileRow,
  studentProfileRowsFromUser,
  validateStudentProfileRows,
  type StudentProfileRow,
} from "../utils/studentProfileForm";
import type { StudentProfile } from "../types";

interface ReferenceItem {
  id?: string;
  _id?: string;
  code?: string;
  name?: string;
}

interface UserProfile {
  id: string;
  login?: string;
  role?: Role;
  email?: string;
  firstName?: string;
  lastName?: string;
  middleName?: string;
  phone?: string;
  studentProfiles?: StudentProfile[];
  activeStudentProfileId?: string | null;
  teacherProfile?: {
    department?: ReferenceItem | string | null;
    position?: string;
    externalTeacherId?: string;
  };
}

type UserFormData = {
  login: string;
  password?: string;
  role: Role;
  email: string;
  firstName: string;
  lastName: string;
  middleName: string;
  phone: string;
  studentProfiles: StudentProfileRow[];
  departmentId: string;
  position: string;
  externalTeacherId: string;
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  userToEdit?: UserProfile | null;
}

function getReferenceId(
  value: ReferenceItem | string | null | undefined,
): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value.id || value._id || "";
}

function buildInitialFormData(userToEdit?: UserProfile | null): UserFormData {
  if (!userToEdit) {
    return {
      login: "",
      password: "",
      role: Role.STUDENT,
      email: "",
      firstName: "",
      lastName: "",
      middleName: "",
      phone: "",
      studentProfiles: studentProfileRowsFromUser(userToEdit),
      departmentId: "",
      position: "",
      externalTeacherId: "",
    };
  }

  return {
    login: userToEdit.login || "",
    password: "",
    role: userToEdit.role || Role.STUDENT,
    email: userToEdit.email || "",
    firstName: userToEdit.firstName || "",
    lastName: userToEdit.lastName || "",
    middleName: userToEdit.middleName || "",
    phone: userToEdit.phone || "",
    studentProfiles: studentProfileRowsFromUser(userToEdit),
    departmentId: getReferenceId(userToEdit.teacherProfile?.department),
    position: userToEdit.teacherProfile?.position || "",
    externalTeacherId: userToEdit.teacherProfile?.externalTeacherId || "",
  };
}

export default function CreateUserModal({
  isOpen,
  onClose,
  onSuccess,
  userToEdit,
}: Props) {
  const { t, i18n } = useTranslation();

  const [formData, setFormData] = useState<UserFormData>(() =>
    buildInitialFormData(userToEdit),
  );

  const [groups, setGroups] = useState<ReferenceItem[]>([]);
  const [departments, setDepartments] = useState<ReferenceItem[]>([]);
  const [error, setError] = useAutoDismissState("");
  const [passwordError, setPasswordError] = useState("");
  const [loading, setLoading] = useState(false);

  // PATCH /users/:id fully replaces the profiles array, so we send it only
  // when the administrator actually edited the profiles block.
  const [profilesDirty, setProfilesDirty] = useState(false);

  const updateProfileRow = (
    index: number,
    patch: Partial<StudentProfileRow>,
  ) => {
    setProfilesDirty(true);
    setFormData((current) => ({
      ...current,
      studentProfiles: current.studentProfiles.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    }));
  };

  const addProfileRow = () => {
    setProfilesDirty(true);
    setFormData((current) => ({
      ...current,
      studentProfiles: [...current.studentProfiles, emptyStudentProfileRow()],
    }));
  };

  const removeProfileRow = (index: number) => {
    setProfilesDirty(true);
    setFormData((current) => ({
      ...current,
      studentProfiles: current.studentProfiles.filter(
        (_, rowIndex) => rowIndex !== index,
      ),
    }));
  };

  const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]+$/;

  const validatePassword = (pwd: string) => {
    if (!pwd) return "";
    if (pwd.length < 8) return t("users.form.validation.passwordMin");
    if (!PASSWORD_REGEX.test(pwd)) {
      return t("users.form.validation.passwordFormat");
    }
    return "";
  };

  useEffect(() => {
    if (!isOpen) return;
    api
      .get("/references/groups")
      .then(({ data }) => setGroups(data))
      .catch(() => {});
    api
      .get("/references/departments")
      .then(({ data }) => setDepartments(data))
      .catch(() => {});
  }, [isOpen]);

  if (!isOpen) return null;

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const target = e.currentTarget;
    const value =
      target.type === "number" ? Number(target.value) : target.value;
    setFormData({ ...formData, [target.name]: value });
    if (target.name === "password") {
      setPasswordError(validatePassword(target.value));
    }
  };

  const buildBasePayload = () => {
    const payload: Record<string, unknown> = {
      login: formData.login.trim(),
      email: formData.email.trim(),
      firstName: formData.firstName.trim(),
      lastName: formData.lastName.trim(),
      middleName: formData.middleName.trim(),
      phone: formData.phone.trim(),
    };

    if (formData.password) {
      payload.password = formData.password;
    }

    return payload;
  };

  const roleChanged = Boolean(userToEdit) && userToEdit?.role !== formData.role;
  const sendsProfiles = !userToEdit || roleChanged || profilesDirty;

  const buildRolePayload = () => {
    const payload: Record<string, unknown> = {
      role: formData.role,
    };

    if (formData.role === Role.STUDENT && sendsProfiles) {
      payload.studentProfiles = buildStudentProfilesPayload(
        formData.studentProfiles,
      );
    }

    if (formData.role === Role.TEACHER) {
      payload.departmentId = formData.departmentId;
      payload.position = formData.position.trim();
      payload.externalTeacherId = formData.externalTeacherId.trim() || undefined;
    }

    return payload;
  };

  const handleSubmit = async (
    e: SyntheticEvent<HTMLFormElement, SubmitEvent>,
  ) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (formData.password) {
      const pwdErr = validatePassword(formData.password);
      if (pwdErr) {
        setPasswordError(pwdErr);
        setLoading(false);
        return;
      }
    }

    if (formData.role === Role.STUDENT && sendsProfiles) {
      const profilesErrorKey = validateStudentProfileRows(
        formData.studentProfiles,
      );
      if (profilesErrorKey) {
        setError(t(profilesErrorKey));
        setLoading(false);
        return;
      }
    }

    try {
      const basePayload = buildBasePayload();
      const rolePayload = buildRolePayload();

      if (userToEdit) {
        if (roleChanged) {
          await api.patch(`/users/${userToEdit.id}`, basePayload);
          await api.patch(`/users/${userToEdit.id}/role`, rolePayload);
        } else {
          await api.patch(`/users/${userToEdit.id}`, {
            ...basePayload,
            ...rolePayload,
          });
        }
      } else {
        await api.post("/users", {
          ...basePayload,
          ...rolePayload,
        });
      }

      onSuccess();
      onClose();
      setFormData(buildInitialFormData());
    } catch (err: unknown) {
      setError(
        getLocalizedApiErrorMessage(
          err,
          i18n.language,
          t(
            userToEdit
              ? "users.form.errors.update"
              : "users.form.errors.create",
          ),
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-xl font-semibold">
            {t(userToEdit ? "users.form.editTitle" : "users.form.createTitle")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("users.form.close")}
            className="text-gray-500 hover:text-gray-700 p-1"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          {error && (
            <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          <form
            id="createUserForm"
            onSubmit={handleSubmit}
            className="space-y-4"
          >
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("users.form.role")} *
              </label>
              <select
                name="role"
                value={formData.role}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              >
                {Object.values(Role).map((r) => (
                  <option key={r} value={r}>
                    {t(ROLE_LABEL_KEYS[r]) || r}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t("users.form.lastName")} *
                </label>
                <input
                  type="text"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t("users.form.firstName")} *
                </label>
                <input
                  type="text"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("users.form.middleName")}
              </label>
              <input
                type="text"
                name="middleName"
                value={formData.middleName}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t("users.form.login")} *
                </label>
                <input
                  type="text"
                  name="login"
                  value={formData.login}
                  onChange={handleChange}
                  required
                  minLength={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <p className="mt-1 text-xs text-gray-400">
                  {t("users.form.loginHint")}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t("users.form.password")} {!userToEdit && "*"}
                </label>
                <input
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  required={!userToEdit}
                  minLength={8}
                  placeholder={
                    userToEdit
                      ? t("users.form.passwordUnchangedPlaceholder")
                      : ""
                  }
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none ${
                    passwordError ? "border-red-400" : "border-gray-300"
                  }`}
                />
                {passwordError ? (
                  <p className="mt-1 text-xs text-red-500">{passwordError}</p>
                ) : (
                  <p className="mt-1 text-xs text-gray-400">
                    {t("users.form.passwordHint")}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t("users.form.email")} *
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t("users.form.phone")}
                </label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>

            {formData.role === Role.STUDENT && (
              <div className="space-y-4 rounded-lg border border-blue-100 bg-blue-50/50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-medium text-blue-900">
                    {t("users.form.studentProfiles")}
                  </h3>

                  <button
                    type="button"
                    onClick={addProfileRow}
                    disabled={
                      formData.studentProfiles.length >= MAX_STUDENT_PROFILES
                    }
                    className="inline-flex items-center gap-1 rounded-lg border border-blue-300 px-3 py-1.5 text-sm text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    {t("users.form.addProfile")}
                  </button>
                </div>

                <p className="text-xs text-gray-500">
                  {t("users.form.studentProfilesHint")}
                </p>

                {formData.studentProfiles.map((row, index) => (
                  <fieldset
                    key={index}
                    className="space-y-4 rounded-lg border border-blue-200 bg-white p-3"
                  >
                    <legend className="flex w-full items-center justify-between gap-3 px-1 text-sm font-medium text-blue-900">
                      <span>
                        {t("users.form.profileNumber", { n: index + 1 })}
                      </span>

                      {formData.studentProfiles.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeProfileRow(index)}
                          className="text-red-600 hover:text-red-800"
                          title={t("users.form.removeProfile")}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      )}
                    </legend>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">
                          {t("users.form.group")} *
                        </label>
                        <select
                          value={row.groupId}
                          onChange={(event) =>
                            updateProfileRow(index, {
                              groupId: event.currentTarget.value,
                            })
                          }
                          required
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">
                            {t("users.form.selectGroup")}
                          </option>
                          {groups.map((group) => (
                            <option
                              key={group.id || group._id}
                              value={group.id || group._id}
                            >
                              {group.code}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">
                          {t("users.form.recordBookNumber")} *
                        </label>
                        <input
                          type="text"
                          value={row.recordBookNumber}
                          onChange={(event) =>
                            updateProfileRow(index, {
                              recordBookNumber: event.currentTarget.value,
                            })
                          }
                          required
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">
                          {t("users.form.studyYear")} *
                        </label>
                        <input
                          type="number"
                          value={row.year}
                          onChange={(event) =>
                            updateProfileRow(index, {
                              year: Number(event.currentTarget.value),
                            })
                          }
                          required
                          min={1}
                          max={6}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">
                          {t("users.form.externalStudentId")} *
                        </label>
                        <input
                          type="text"
                          value={row.externalStudentId}
                          onChange={(event) =>
                            updateProfileRow(index, {
                              externalStudentId: event.currentTarget.value,
                            })
                          }
                          required
                          maxLength={128}
                          placeholder={t(
                            "users.form.externalStudentIdPlaceholder",
                          )}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <p className="mt-1 text-xs text-gray-400">
                          {t("users.form.externalStudentIdHint")}
                        </p>
                      </div>
                    </div>
                  </fieldset>
                ))}
              </div>
            )}

            {formData.role === Role.TEACHER && (
              <div className="p-4 border border-blue-100 bg-blue-50/50 rounded-lg space-y-4">
                <h3 className="font-medium text-blue-900">
                  {t("users.form.teacherData")}
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {t("users.form.department")} *
                    </label>
                    <select
                      name="departmentId"
                      value={formData.departmentId}
                      onChange={handleChange}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value="">
                        {t("users.form.selectDepartment")}
                      </option>
                      {departments.map((d) => (
                        <option key={d.id || d._id} value={d.id || d._id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {t("users.form.position")} *
                    </label>
                    <input
                      type="text"
                      name="position"
                      value={formData.position}
                      onChange={handleChange}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {t("users.form.externalTeacherId")}
                    </label>
                    <input
                      type="text"
                      name="externalTeacherId"
                      value={formData.externalTeacherId}
                      onChange={handleChange}
                      maxLength={64}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      {t("users.form.externalTeacherIdHint")}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </form>
        </div>

        <div className="p-4 border-t bg-gray-50 flex justify-end gap-3 rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            {t("users.form.cancel")}
          </button>
          <button
            type="submit"
            form="createUserForm"
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading
              ? t("users.form.saving")
              : t(userToEdit ? "users.form.saveChanges" : "users.form.create")}
          </button>
        </div>
      </div>
    </div>
  );
}
