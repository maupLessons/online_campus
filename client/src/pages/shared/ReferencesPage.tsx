import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import ReferenceFormModal from "../../components/references/ReferenceFormModal";
import ReferenceImportModal from "../../components/references/ReferenceImportModal";
import {
  ReferenceType,
  referencesApi,
  type ClassroomReference,
  type DepartmentReference,
  type FacultyReference,
  type GroupReference,
  type ReferencePayload,
  type ReferenceRecord,
  type ReferenceUser,
  type SpecialtyReference,
} from "../../services/referencesApi";
import { useAuthStore } from "../../store/authStore";
import { Role, type User } from "../../types";

const REFERENCE_TYPES: ReferenceType[] = Object.values(ReferenceType);

function userName(user?: ReferenceUser) {
  if (!user) return "—";
  return [user.lastName, user.firstName, user.middleName]
    .filter(Boolean)
    .join(" ");
}

function uniqueUsers(users: User[]) {
  return [...new Map(users.map((user) => [user.id, user])).values()].sort(
    (left, right) =>
      `${left.lastName} ${left.firstName}`.localeCompare(
        `${right.lastName} ${right.firstName}`,
        "uk",
      ),
  );
}

export default function ReferencesPage() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const canManage = user?.role === Role.ADMIN;
  const [type, setType] = useState<ReferenceType>(ReferenceType.FACULTIES);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<ReferenceRecord | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [actionError, setActionError] = useState("");

  const referencesQuery = useQuery({
    queryKey: ["references", type, page, appliedSearch],
    queryFn: () =>
      referencesApi.list(type, {
        page,
        limit: 10,
        search: appliedSearch || undefined,
      }),
  });

  const optionsQuery = useQuery({
    queryKey: ["admin-reference-options"],
    queryFn: async () => {
      const [faculties, specialties, deans, departmentHeads, teachers] =
        await Promise.all([
          referencesApi.listOptions<FacultyReference>(ReferenceType.FACULTIES),
          referencesApi.listOptions<SpecialtyReference>(
            ReferenceType.SPECIALTIES,
          ),
          referencesApi.listUsers(Role.DEAN),
          referencesApi.listUsers(Role.DEPARTMENT_HEAD),
          referencesApi.listUsers(Role.TEACHER),
        ]);
      return {
        faculties,
        specialties,
        deans,
        departmentHeads,
        curators: uniqueUsers([...teachers, ...departmentHeads, ...deans]),
      };
    },
    enabled: canManage,
  });

  const saveMutation = useMutation({
    mutationFn: async ({
      record,
      payload,
    }: {
      record: ReferenceRecord | null;
      payload: ReferencePayload;
    }) => {
      if (record) {
        return referencesApi.update(type, record.id, payload);
      }
      return referencesApi.create(type, payload);
    },
    onSuccess: async () => {
      setFormOpen(false);
      setEditing(null);
      setActionError("");
      await queryClient.invalidateQueries({
        queryKey: ["references"],
      });
      await queryClient.invalidateQueries({
        queryKey: ["admin-reference-options"],
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (record: ReferenceRecord) =>
      referencesApi.remove(type, record.id),
    onSuccess: async () => {
      setActionError("");
      await queryClient.invalidateQueries({
        queryKey: ["references"],
      });
      await queryClient.invalidateQueries({
        queryKey: ["admin-reference-options"],
      });
    },
    onError: () => setActionError(t("references.deleteConflict")),
  });

  const options = optionsQuery.data ?? {
    faculties: [],
    specialties: [],
    deans: [],
    departmentHeads: [],
    curators: [],
  };

  const selectType = (nextType: ReferenceType) => {
    setType(nextType);
    setPage(1);
    setSearch("");
    setAppliedSearch("");
    setActionError("");
  };

  const openCreate = () => {
    if (!canManage) return;
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (record: ReferenceRecord) => {
    if (!canManage) return;
    setEditing(record);
    setFormOpen(true);
  };

  const remove = (record: ReferenceRecord) => {
    if (!canManage) return;
    if (window.confirm(t("references.deleteConfirm"))) {
      deleteMutation.mutate(record);
    }
  };

  const exportReferences = async (format: "csv" | "xlsx") => {
    setActionError("");
    try {
      await referencesApi.export(
        type,
        format,
        i18n.language.startsWith("en") ? "en" : "uk",
      );
    } catch {
      setActionError(t("references.exportError"));
    }
  };

  const renderActions = (record: ReferenceRecord) => (
    <div className="flex items-center justify-end gap-1">
      <button
        type="button"
        onClick={() => openEdit(record)}
        className="flex h-9 w-9 items-center justify-center rounded-md text-blue-700 hover:bg-blue-50"
        title={t("references.edit")}
      >
        <Pencil className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => remove(record)}
        disabled={deleteMutation.isPending}
        className="flex h-9 w-9 items-center justify-center rounded-md text-red-600 hover:bg-red-50 disabled:opacity-50"
        title={t("references.delete")}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );

  const records = referencesQuery.data?.docs ?? [];

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <section className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {t("references.title")}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {t(
              canManage
                ? "references.subtitle"
                : "references.readOnlySubtitle",
            )}
          </p>
        </div>
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Upload className="h-4 w-4" />
              {t("references.importButton")}
            </button>
            <button
              type="button"
              onClick={() => void exportReferences("csv")}
              className="flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-4 w-4" />
              CSV
            </button>
            <button
              type="button"
              onClick={() => void exportReferences("xlsx")}
              className="flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-4 w-4" />
              XLSX
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="flex h-10 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              {t("references.create")}
            </button>
          </div>
        ) : (
          <span className="inline-flex h-9 items-center rounded-md bg-slate-100 px-3 text-sm font-medium text-slate-600">
            {t("references.readOnly")}
          </span>
        )}
      </section>

      <div
        role="tablist"
        aria-label={t("references.title")}
        className="flex gap-1 overflow-x-auto border-b border-slate-200"
      >
        {REFERENCE_TYPES.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={type === item}
            onClick={() => selectType(item)}
            className={`min-h-11 whitespace-nowrap border-b-2 px-4 text-sm font-medium ${
              type === item
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            {t(`references.types.${item}`)}
          </button>
        ))}
      </div>

      <section className="flex flex-col gap-3 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                setPage(1);
                setAppliedSearch(search.trim());
              }
            }}
            placeholder={t("references.searchPlaceholder")}
            className="h-10 w-full rounded-md border border-slate-300 bg-white pl-10 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            setPage(1);
            setAppliedSearch(search.trim());
          }}
          className="h-10 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          {t("references.search")}
        </button>
      </section>

      {actionError && (
        <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </p>
      )}

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {referencesQuery.isLoading ? (
          <div className="p-10 text-center text-sm text-slate-500">
            {t("references.loading")}
          </div>
        ) : referencesQuery.isError ? (
          <div className="p-10 text-center text-sm text-red-700">
            {t("references.loadError")}
          </div>
        ) : records.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            {t("references.empty")}
          </div>
        ) : (
          <div className="overflow-x-auto">{renderTable()}</div>
        )}
      </section>

      <div className="flex items-center justify-between gap-4 text-sm text-slate-600">
        <span>
          {t("references.total", {
            count: referencesQuery.data?.totalDocs ?? 0,
          })}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={!referencesQuery.data?.hasPrevPage}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 bg-white disabled:opacity-40"
            aria-label={t("references.previous")}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span>
            {t("references.page", {
              page: referencesQuery.data?.page ?? 1,
              total: referencesQuery.data?.totalPages ?? 1,
            })}
          </span>
          <button
            type="button"
            onClick={() => setPage((current) => current + 1)}
            disabled={!referencesQuery.data?.hasNextPage}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 bg-white disabled:opacity-40"
            aria-label={t("references.next")}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {canManage && formOpen && (
        <ReferenceFormModal
          key={`${type}-${editing?.id ?? "create"}`}
          type={type}
          record={editing}
          options={options}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          onSubmit={async (payload) => {
            await saveMutation.mutateAsync({ record: editing, payload });
          }}
        />
      )}

      {canManage && importOpen && (
        <ReferenceImportModal
          key={type}
          type={type}
          onClose={() => setImportOpen(false)}
          onImported={() => {
            setImportOpen(false);
            void queryClient.invalidateQueries({
                queryKey: ["references"],
            });
            void queryClient.invalidateQueries({
              queryKey: ["admin-reference-options"],
            });
          }}
        />
      )}
    </div>
  );

  function renderTable() {
    const tableClass = "min-w-[780px] w-full text-sm";
    const headClass =
      "border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500";
    const thClass = "px-4 py-3";
    const tdClass = "px-4 py-3 text-slate-700";

    if (type === ReferenceType.FACULTIES) {
      return (
        <table className={tableClass}>
          <thead className={headClass}>
            <tr>
              <th className={thClass}>{t("references.fields.name")}</th>
              <th className={thClass}>{t("references.fields.dean")}</th>
              {canManage && (
                <th className={`${thClass} text-right`}>
                  {t("references.actions")}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {(records as FacultyReference[]).map((record) => (
              <tr
                key={record.id}
                className="border-b border-slate-100 last:border-0"
              >
                <td className={`${tdClass} font-medium text-slate-900`}>
                  {record.name}
                </td>
                <td className={tdClass}>{userName(record.dean)}</td>
                {canManage && (
                  <td className={tdClass}>{renderActions(record)}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    if (type === ReferenceType.DEPARTMENTS) {
      return (
        <table className={tableClass}>
          <thead className={headClass}>
            <tr>
              <th className={thClass}>{t("references.fields.name")}</th>
              <th className={thClass}>{t("references.fields.faculty")}</th>
              <th className={thClass}>{t("references.fields.head")}</th>
              {canManage && (
                <th className={`${thClass} text-right`}>
                  {t("references.actions")}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {(records as DepartmentReference[]).map((record) => (
              <tr
                key={record.id}
                className="border-b border-slate-100 last:border-0"
              >
                <td className={`${tdClass} font-medium text-slate-900`}>
                  {record.name}
                </td>
                <td className={tdClass}>{record.faculty.name}</td>
                <td className={tdClass}>{userName(record.head)}</td>
                {canManage && (
                  <td className={tdClass}>{renderActions(record)}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    if (type === ReferenceType.SPECIALTIES) {
      return (
        <table className={tableClass}>
          <thead className={headClass}>
            <tr>
              <th className={thClass}>{t("references.fields.code")}</th>
              <th className={thClass}>{t("references.fields.name")}</th>
              {canManage && (
                <th className={`${thClass} text-right`}>
                  {t("references.actions")}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {(records as SpecialtyReference[]).map((record) => (
              <tr
                key={record.id}
                className="border-b border-slate-100 last:border-0"
              >
                <td className={`${tdClass} font-medium text-slate-900`}>
                  {record.code}
                </td>
                <td className={tdClass}>{record.name}</td>
                {canManage && (
                  <td className={tdClass}>{renderActions(record)}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    if (type === ReferenceType.GROUPS) {
      return (
        <table className={tableClass}>
          <thead className={headClass}>
            <tr>
              <th className={thClass}>{t("references.fields.code")}</th>
              <th className={thClass}>{t("references.fields.specialty")}</th>
              <th className={thClass}>{t("references.fields.course")}</th>
              <th className={thClass}>{t("references.fields.curator")}</th>
              {canManage && (
                <th className={`${thClass} text-right`}>
                  {t("references.actions")}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {(records as GroupReference[]).map((record) => (
              <tr
                key={record.id}
                className="border-b border-slate-100 last:border-0"
              >
                <td className={`${tdClass} font-medium text-slate-900`}>
                  {record.code}
                </td>
                <td className={tdClass}>
                  {record.specialty.code} - {record.specialty.name}
                </td>
                <td className={tdClass}>{record.course}</td>
                <td className={tdClass}>{userName(record.curator)}</td>
                {canManage && (
                  <td className={tdClass}>{renderActions(record)}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    return (
      <table className={tableClass}>
        <thead className={headClass}>
          <tr>
            <th className={thClass}>{t("references.fields.building")}</th>
            <th className={thClass}>{t("references.fields.roomNumber")}</th>
            <th className={thClass}>{t("references.fields.capacity")}</th>
            <th className={thClass}>{t("references.fields.type")}</th>
            {canManage && (
              <th className={`${thClass} text-right`}>
                {t("references.actions")}
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {(records as ClassroomReference[]).map((record) => (
            <tr
              key={record.id}
              className="border-b border-slate-100 last:border-0"
            >
              <td className={`${tdClass} font-medium text-slate-900`}>
                {record.building}
              </td>
              <td className={tdClass}>{record.roomNumber}</td>
              <td className={tdClass}>{record.capacity}</td>
              <td className={tdClass}>
                {t(`references.classroomTypes.${record.type}`)}
              </td>
              {canManage && (
                <td className={tdClass}>{renderActions(record)}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
}
