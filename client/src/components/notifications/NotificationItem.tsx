import { Link } from 'react-router-dom';
import { ExternalLink, Pencil, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Role, type Notification, type Role as UserRole } from '../../types';

interface Props {
  notification: Notification;
  onRead?: (id: string) => void;
  onDelete?: (id: string) => void;
  onEdit?: (notification: Notification) => void;
  audienceLabel?: string;
  viewerRole?: UserRole;
}

const surveyResultRoles: UserRole[] = [
  Role.ADMIN,
  Role.DEAN,
  Role.RECTOR,
  Role.PRESIDENT,
];

function getSurveyActionUrl(notification: Notification, viewerRole?: UserRole) {
  if (viewerRole && surveyResultRoles.includes(viewerRole)) {
    const surveyId =
      notification.entityId ??
      notification.actionUrl?.match(/^\/surveys\/([^/?#]+)/)?.[1];

    return surveyId
      ? `/surveys/admin/${surveyId}/results`
      : '/surveys/admin';
  }

  if (
    notification.actionUrl?.startsWith('/surveys/') &&
    !notification.actionUrl.startsWith('//')
  ) {
    return notification.actionUrl;
  }

  return '/surveys';
}

function getSafeActionUrl(notification: Notification, viewerRole?: UserRole) {
  if (
    notification.type === 'new_survey' ||
    notification.entityType === 'survey'
  ) {
    return getSurveyActionUrl(notification, viewerRole);
  }

  if (
    notification.actionUrl?.startsWith('/') &&
    !notification.actionUrl.startsWith('//')
  ) {
    return notification.actionUrl;
  }

  return null;
}

export default function NotificationItem({
  notification,
  onRead,
  onDelete,
  onEdit,
  audienceLabel,
  viewerRole,
}: Props) {
  const { t } = useTranslation();
  const actionUrl = getSafeActionUrl(notification, viewerRole);
  const isReadable = Boolean(onRead);
  const isUnread = isReadable && !notification.readFlag;

  return (
    <details
      onToggle={(event) => {
        if (isUnread && onRead) {
          const isOpen = event.currentTarget.open;
          if (isOpen) {
            onRead(notification.id);
          }
        }
      }}
      className={`mb-3 overflow-hidden rounded-xl border transition-colors ${
        isUnread ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-gray-50'
      }`}
    >
      <summary className="cursor-pointer list-none p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <strong className="text-sm text-slate-600">
              {t(`notifications.types.${notification.type}`, {
                defaultValue: notification.type,
              })}
            </strong>

            <div className="mt-1 font-semibold">
              {notification.title}
            </div>

            {audienceLabel && (
              <span className="mt-2 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                {t('notifications.audienceLabel', { audience: audienceLabel })}
              </span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {onEdit && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();

                  onEdit(notification);
                }}
                className="rounded-md p-1 text-gray-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
                aria-label={t('notifications.edit')}
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
              </button>
            )}

            {onDelete && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();

                  onDelete(notification.id);
                }}
                className="rounded-md p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                aria-label={t('notifications.delete')}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </summary>

      <div className="border-t border-gray-200 px-4 pb-4">
        <p className="mt-3 text-gray-700">
          {notification.message}
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <small className="text-gray-500">
            {isReadable
              ? notification.readFlag
                ? t('notifications.read')
                : t('notifications.unread')
              : t('notifications.managed')}
          </small>

          {actionUrl && (
            <Link
              to={actionUrl}
              onClick={() => {
                if (isUnread && onRead) {
                  onRead(notification.id);
                }
              }}
              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              {notification.type === 'new_survey' ||
              notification.entityType === 'survey'
                ? t('notifications.openSurvey')
                : t('notifications.openAction')}
            </Link>
          )}
        </div>
      </div>
    </details>
  );
}
