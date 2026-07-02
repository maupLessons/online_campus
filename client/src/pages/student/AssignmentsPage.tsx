import { useQuery } from "@tanstack/react-query";
import { Download, Trash2, X } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FileUploader } from "../../components/FileUploader";
import { useAutoDismissState } from "../../hooks/useAutoDismissState";
import api, { filesApi } from "../../services/api";
import type { Assignment, PaginatedResponse } from "../../types";
import { getLocalizedApiErrorMessage } from "../../utils/apiErrorMessage";

export default function AssignmentsPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "en" ? "en-US" : "uk-UA";
  const [statusMessage, setStatusMessage] = useAutoDismissState("");
  const [searchParams] = useSearchParams();
  const highlightedAssignmentId = searchParams.get("assignmentId");

  const {
    data: assignments = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["assignments", "my"],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<Assignment>>(
        "/courses/assignments/my",
      );
      return data.docs;
    },
  });

  const showStatus = (message: string) => {
    setStatusMessage(message);
  };

  const getStatusBadge = (assignment: Assignment) => {
    if (!assignment.submission) {
      const isOverdue = new Date(assignment.dueDate) < new Date();
      return isOverdue
        ? {
            label: t("assignments.statusOverdue"),
            color: "bg-red-100 text-red-700",
          }
        : {
            label: t("assignments.statusNotSubmitted"),
            color: "bg-yellow-100 text-yellow-700",
          };
    }

    if (assignment.submission.status === "graded") {
      return {
        label: t("assignments.statusGraded", {
          score: assignment.submission.score,
          maxScore: assignment.maxScore,
        }),
        color: "bg-green-100 text-green-700",
      };
    }

    if (assignment.submission.status === "returned") {
      return {
        label: t("assignments.statusReturned"),
        color: "bg-amber-100 text-amber-800",
      };
    }

    return {
      label: t("assignments.statusPending"),
      color: "bg-blue-100 text-blue-700",
    };
  };

  const handleDownload = async (fileId: string, originalName: string) => {
    try {
      const response = await api.get(`/files/download/${fileId}`, {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", originalName);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch {
      showStatus(t("assignments.downloadError"));
    }
  };

  const handleDelete = async (
    fileId: string | undefined,
    assignmentId: string,
  ) => {
    if (!window.confirm(t("assignments.confirmDelete"))) return;

    try {
      if (fileId) {
        try {
          await api.delete(`/files/${fileId}`);
        } catch {
          // The submission record is the source of truth for the UI cleanup.
        }
      }

      await api.delete(`/courses/assignments/${assignmentId}/submit`);
      await refetch();
      showStatus(t("assignments.deleteSuccess"));
    } catch {
      showStatus(t("assignments.deleteError"));
    }
  };

  const handleUpload = async (assignmentId: string, fileToUpload: File) => {
    try {
      await filesApi.submitAssignment(assignmentId, fileToUpload);
      await refetch();
    } catch (error: unknown) {
      const message = getLocalizedApiErrorMessage(
        error,
        i18n.language,
        t("assignments.uploadError"),
      );

      showStatus(t("assignments.uploadWarning", { message }));
      throw error;
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          {t("assignments.title")}
        </h1>
      </div>

      {statusMessage && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <span>{statusMessage}</span>
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-blue-700 transition hover:bg-blue-100"
            onClick={() => setStatusMessage("")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {assignments.length === 0 ? (
        <p className="text-sm text-gray-400">{t("assignments.empty")}</p>
      ) : (
        <div className="space-y-4">
          {[...assignments]
            .sort((left, right) => {
              if (left.id === highlightedAssignmentId) return -1;
              if (right.id === highlightedAssignmentId) return 1;
              return 0;
            })
            .map((assignment) => {
              const status = getStatusBadge(assignment);
              const isOverdue = new Date(assignment.dueDate) < new Date();
              const isReturned = assignment.submission?.status === "returned";
              const file = assignment.submission?.files?.[0] ?? null;
              const fileId = file ? file.id || file._id : undefined;
              const fileName =
                file?.originalName ??
                assignment.submission?.originalName ??
                t("assignments.uploadedFile");

              return (
                <article
                  key={assignment.id}
                  className={`rounded-xl border bg-white p-5 shadow-sm transition ${
                    assignment.id === highlightedAssignmentId
                      ? "border-blue-400 ring-2 ring-blue-100"
                      : "border-gray-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-gray-900">
                        {assignment.title}
                      </h3>
                      <p className="mt-0.5 text-sm text-gray-500">
                        {assignment.courseName}
                      </p>
                      <p className="mt-2 text-sm text-gray-600">
                        {assignment.description}
                      </p>
                    </div>
                    <span
                      className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${status.color}`}
                    >
                      {status.label}
                    </span>
                  </div>

                  {assignment.submission ? (
                    <div className="mt-4 border-t border-gray-100 pt-4">
                      <p className="mb-3 text-sm text-gray-500">
                        {t(
                          isReturned
                            ? "assignments.previousSubmission"
                            : "assignments.uploadedWork",
                        )}
                      </p>
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={() =>
                            fileId && void handleDownload(fileId, fileName)
                          }
                          disabled={!fileId}
                          className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-50 px-3 text-sm font-medium text-blue-700 transition hover:bg-blue-100 disabled:bg-gray-100 disabled:text-gray-400"
                        >
                          <Download className="h-4 w-4" />
                          {fileName}
                        </button>
                        {assignment.submission.status === "submitted" &&
                          !isOverdue && (
                            <button
                              type="button"
                              onClick={() =>
                                void handleDelete(fileId, assignment.id)
                              }
                              className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 text-red-600 transition hover:bg-red-100"
                              title={t("teacherCourse.common.delete")}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                      </div>

                      {isReturned && (
                        <div className="mt-4 space-y-4">
                          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                            <div className="font-medium">
                              {t("assignments.revisionReason")}
                            </div>
                            <p className="mt-1 whitespace-pre-wrap">
                              {assignment.submission.returnComment ||
                                t("teacherCourse.common.noData")}
                            </p>
                          </div>

                          {isOverdue ? (
                            <p className="text-sm font-medium text-red-500">
                              {t("assignments.overdueUploadBlocked")}
                            </p>
                          ) : (
                            <div>
                              <p className="mb-3 text-sm font-medium text-gray-700">
                                {t("assignments.resubmit")}
                              </p>
                              <FileUploader
                                allowedTypes={[".pdf", ".doc", ".docx", ".zip"]}
                                onUpload={(fileToUpload) =>
                                  handleUpload(assignment.id, fileToUpload)
                                }
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : isOverdue ? (
                    <div className="mt-4 border-t border-gray-100 pt-4">
                      <p className="text-sm font-medium text-red-500">
                        {t("assignments.overdueUploadBlocked")}
                      </p>
                    </div>
                  ) : (
                    <div className="mt-4 border-t border-gray-100 pt-4">
                      <p className="mb-3 text-sm font-medium text-gray-700">
                        {t("assignments.attachFile")}
                      </p>
                      <FileUploader
                        allowedTypes={[".pdf", ".doc", ".docx", ".zip"]}
                        onUpload={(fileToUpload) =>
                          handleUpload(assignment.id, fileToUpload)
                        }
                      />
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-gray-50 pt-3 text-xs text-gray-400">
                    <span>
                      {t("assignments.deadline")}:{" "}
                      {new Date(assignment.dueDate).toLocaleDateString(locale)}
                    </span>
                    <span>
                      {t("assignments.maxScore")}: {assignment.maxScore}
                    </span>
                    {assignment.submission?.submittedAt && (
                      <span>
                        {t("assignments.submittedAt")}:{" "}
                        {new Date(
                          assignment.submission.submittedAt,
                        ).toLocaleString(locale)}
                      </span>
                    )}
                    {assignment.submission && (
                      <span>
                        {t("assignments.attempt", {
                          count: assignment.submission.attemptNumber ?? 1,
                        })}
                      </span>
                    )}
                    {assignment.submission?.comment && (
                      <div className="mt-1 w-full text-gray-600 italic">
                        <span className="font-medium text-gray-500">
                          {t("assignments.comment")}:
                        </span>{" "}
                        {assignment.submission.comment}
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
        </div>
      )}
    </div>
  );
}
