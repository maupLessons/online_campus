import { useEffect, useState } from "react";
import type { SyntheticEvent } from "react";
import api from "../../services/api";
import { notificationsApi } from "../../services/notificationsApi";
import type { Notification, NotificationInput } from "../../types";
import { useTranslation } from "react-i18next";
import { useAutoDismissState } from "../../hooks/useAutoDismissState";

interface ReferenceItem {
  id?: string;
  _id?: string;
  code?: string;
  name?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (notification: Notification) => void | Promise<void>;
  notification?: Notification | null;
}

interface NotificationFormProps {
  groups: ReferenceItem[];
  notification: Notification | null;
  onClose: () => void;
  onCreated: (notification: Notification) => void | Promise<void>;
}

type NotificationTargetType =
  | "all"
  | "students"
  | "teachers"
  | "students_teachers"
  | "group";

const notificationTargetTypes: NotificationTargetType[] = [
  "all",
  "students",
  "teachers",
  "students_teachers",
  "group",
];

function NotificationForm({
  groups,
  notification,
  onClose,
  onCreated,
}: NotificationFormProps) {
  const { t } = useTranslation();
  const isEditing = Boolean(notification);
  const [title, setTitle] = useState(() => notification?.title ?? "");
  const [message, setMessage] = useState(() => notification?.message ?? "");
  const [type, setType] = useState(() => notification?.type ?? "announcement");
  const [targetType, setTargetType] = useState<NotificationTargetType>(() =>
    notification?.targetType !== undefined &&
    notificationTargetTypes.includes(notification.targetType)
      ? notification.targetType
      : "all",
  );
  const [groupId, setGroupId] = useState(() => notification?.groupId ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useAutoDismissState("");

  const handleSubmit = async (
    event: SyntheticEvent<HTMLFormElement, SubmitEvent>,
  ) => {
    event.preventDefault();

    try {
      setLoading(true);
      setError("");

      const payload: NotificationInput = {
        title,
        message,
        type,
        targetType,
        ...(targetType === "group" ? { groupId } : {}),
      };

      const savedNotification = notification
        ? await notificationsApi.update(notification.id, payload)
        : await notificationsApi.create(payload);

      await onCreated(savedNotification);
      onClose();
    } catch (err) {
      console.error(err);
      setError(
        t(
          isEditing
            ? "notifications.form.errors.update"
            : "notifications.form.errors.create",
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: "100%",
    padding: "10px 12px",
    marginTop: "6px",
    border: "1px solid #d1d5db",
    borderRadius: "8px",
    fontSize: "14px",
    outline: "none",
    transition: "border-color 0.2s, box-shadow 0.2s",
    boxSizing: "border-box" as const,
  };

  const focusStyle = {
    borderColor: "#6366f1",
    boxShadow: "0 0 0 3px rgba(99,102,241,0.15)",
  };

  return (
    <>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "24px",
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: "20px",
            fontWeight: 600,
            color: "#1e293b",
          }}
        >
          {t(
            isEditing
              ? "notifications.form.editTitle"
              : "notifications.form.createTitle",
          )}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("notifications.form.close")}
          style={{
            background: "none",
            border: "none",
            fontSize: "20px",
            color: "#94a3b8",
            cursor: "pointer",
            padding: "4px 8px",
            borderRadius: "6px",
            transition: "background 0.2s, color 0.2s",
          }}
          onMouseEnter={(event) => {
            event.currentTarget.style.background = "#f1f5f9";
            event.currentTarget.style.color = "#334155";
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.background = "none";
            event.currentTarget.style.color = "#94a3b8";
          }}
        >
          ×
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        {error && (
          <div
            style={{
              marginBottom: "16px",
              border: "1px solid #fecaca",
              borderRadius: "10px",
              background: "#fef2f2",
              color: "#b91c1c",
              padding: "10px 12px",
              fontSize: "14px",
            }}
          >
            {error}
          </div>
        )}

        <div style={{ marginBottom: "18px" }}>
          <label
            style={{ fontSize: "14px", fontWeight: 500, color: "#475569" }}
          >
            {t("notifications.form.type")}
          </label>
          <select
            value={type}
            onChange={(event) => setType(event.target.value)}
            style={inputStyle}
            onFocus={(event) => {
              event.currentTarget.style.borderColor = focusStyle.borderColor;
              event.currentTarget.style.boxShadow = focusStyle.boxShadow;
            }}
            onBlur={(event) => {
              event.currentTarget.style.borderColor = "#d1d5db";
              event.currentTarget.style.boxShadow = "none";
            }}
          >
            <option value="announcement">
              {t("notifications.types.announcement")}
            </option>
            <option value="system">{t("notifications.types.system")}</option>
            <option value="grade">{t("notifications.types.grade")}</option>
            <option value="new_assignment">
              {t("notifications.types.new_assignment")}
            </option>
            <option value="schedule_change">
              {t("notifications.types.schedule_change")}
            </option>
          </select>
        </div>

        <div style={{ marginBottom: "18px" }}>
          <label
            style={{ fontSize: "14px", fontWeight: 500, color: "#475569" }}
          >
            {t("notifications.form.title")}
          </label>
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            style={inputStyle}
            placeholder={t("notifications.form.titlePlaceholder")}
            onFocus={(event) => {
              event.currentTarget.style.borderColor = focusStyle.borderColor;
              event.currentTarget.style.boxShadow = focusStyle.boxShadow;
            }}
            onBlur={(event) => {
              event.currentTarget.style.borderColor = "#d1d5db";
              event.currentTarget.style.boxShadow = "none";
            }}
          />
        </div>

        <div style={{ marginBottom: "18px" }}>
          <label
            style={{ fontSize: "14px", fontWeight: 500, color: "#475569" }}
          >
            {t("notifications.form.message")}
          </label>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            required
            rows={5}
            style={{ ...inputStyle, resize: "vertical", minHeight: "100px" }}
            placeholder={t("notifications.form.messagePlaceholder")}
            onFocus={(event) => {
              event.currentTarget.style.borderColor = focusStyle.borderColor;
              event.currentTarget.style.boxShadow = focusStyle.boxShadow;
            }}
            onBlur={(event) => {
              event.currentTarget.style.borderColor = "#d1d5db";
              event.currentTarget.style.boxShadow = "none";
            }}
          />
        </div>

        <div style={{ marginBottom: "18px" }}>
          <label
            style={{ fontSize: "14px", fontWeight: 500, color: "#475569" }}
          >
            {t("notifications.form.recipient")}
          </label>
          <select
            value={targetType}
            onChange={(event) =>
              setTargetType(event.target.value as NotificationTargetType)
            }
            style={inputStyle}
            onFocus={(event) => {
              event.currentTarget.style.borderColor = focusStyle.borderColor;
              event.currentTarget.style.boxShadow = focusStyle.boxShadow;
            }}
            onBlur={(event) => {
              event.currentTarget.style.borderColor = "#d1d5db";
              event.currentTarget.style.boxShadow = "none";
            }}
          >
            <option value="all">{t("notifications.form.targets.all")}</option>
            <option value="students">
              {t("notifications.form.targets.students")}
            </option>
            <option value="teachers">
              {t("notifications.form.targets.teachers")}
            </option>
            <option value="students_teachers">
              {t("notifications.form.targets.studentsTeachers")}
            </option>
            <option value="group">
              {t("notifications.form.targets.group")}
            </option>
          </select>
        </div>

        {targetType === "group" && (
          <div style={{ marginBottom: "18px" }}>
            <label
              style={{ fontSize: "14px", fontWeight: 500, color: "#475569" }}
            >
              {t("notifications.form.group")}
            </label>
            <select
              value={groupId}
              onChange={(event) => setGroupId(event.target.value)}
              required
              style={inputStyle}
              onFocus={(event) => {
                event.currentTarget.style.borderColor = focusStyle.borderColor;
                event.currentTarget.style.boxShadow = focusStyle.boxShadow;
              }}
              onBlur={(event) => {
                event.currentTarget.style.borderColor = "#d1d5db";
                event.currentTarget.style.boxShadow = "none";
              }}
            >
              <option value="">{t("notifications.form.selectGroup")}</option>
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
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            padding: "12px",
            backgroundColor: loading ? "#94a3b8" : "#6366f1",
            color: "#fff",
            border: "none",
            borderRadius: "10px",
            fontWeight: 600,
            fontSize: "16px",
            cursor: loading ? "not-allowed" : "pointer",
            transition: "background-color 0.2s, transform 0.1s",
            marginTop: "8px",
          }}
          onMouseEnter={(event) => {
            if (!loading) event.currentTarget.style.backgroundColor = "#4f46e5";
          }}
          onMouseLeave={(event) => {
            if (!loading) event.currentTarget.style.backgroundColor = "#6366f1";
          }}
          onMouseDown={(event) => {
            if (!loading) event.currentTarget.style.transform = "scale(0.98)";
          }}
          onMouseUp={(event) => {
            if (!loading) event.currentTarget.style.transform = "scale(1)";
          }}
        >
          {loading
            ? isEditing
              ? t("notifications.form.saving")
              : t("notifications.form.creating")
            : isEditing
              ? t("notifications.form.saveChanges")
              : t("notifications.form.create")}
        </button>
      </form>
    </>
  );
}

export default function CreateNotificationModal({
  open,
  onClose,
  onCreated,
  notification = null,
}: Props) {
  const [groups, setGroups] = useState<ReferenceItem[]>([]);

  useEffect(() => {
    if (!open) return;

    api
      .get("/references/groups")
      .then(({ data }) => setGroups(data))
      .catch(() => {});
  }, [open]);

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        backdropFilter: "blur(3px)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 1000,
        padding: "16px",
      }}
    >
      <div
        style={{
          background: "#ffffff",
          padding: "24px",
          borderRadius: "16px",
          width: "100%",
          maxWidth: "440px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.12)",
        }}
      >
        <NotificationForm
          key={notification?.id ?? "create"}
          groups={groups}
          notification={notification}
          onClose={onClose}
          onCreated={onCreated}
        />
      </div>
    </div>
  );
}
