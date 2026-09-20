import { FileText, Link as LinkIcon, PlayCircle, Paperclip } from 'lucide-react';
import type { CourseResourceType } from '../types';

export const MAX_RESOURCES = 20;
export const MAX_URL_LENGTH = 500;

export function validateResourceUrl(value: string): string | null {
  if (!value || value.length > MAX_URL_LENGTH) return 'courses.resources.errors.url';
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password) return 'courses.resources.errors.url';
    return null;
  } catch {
    return 'courses.resources.errors.url';
  }
}

export function resourceTypeIcon(type: CourseResourceType) {
  switch (type) {
    case 'video': return PlayCircle;
    case 'document': return FileText;
    case 'other': return Paperclip;
    default: return LinkIcon;
  }
}
