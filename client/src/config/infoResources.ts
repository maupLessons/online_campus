import { BookOpen, Globe, GraduationCap, Library, type LucideIcon } from 'lucide-react';
import { moodleBaseUrl } from './externalLearning';

export type InfoResourceKey = 'site' | 'moodle' | 'repository' | 'library';

export type InfoResource = {
  key: InfoResourceKey;
  url: string;
  icon: LucideIcon;
};

export const INFO_RESOURCES: readonly InfoResource[] = [
  { key: 'site', url: 'https://maup.com.ua/', icon: Globe },
  { key: 'moodle', url: moodleBaseUrl, icon: GraduationCap },
  { key: 'repository', url: 'https://ir.maup.com.ua/home', icon: BookOpen },
  { key: 'library', url: 'https://library.maup.com.ua/', icon: Library },
];
