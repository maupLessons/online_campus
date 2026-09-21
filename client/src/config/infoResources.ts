import {
  BookOpen,
  Globe,
  GraduationCap,
  Library,
  Smartphone,
  TabletSmartphone,
  type LucideIcon,
} from 'lucide-react';
import { moodleBaseUrl } from './externalLearning';

export type InfoResourceKey =
  | 'site'
  | 'moodle'
  | 'repository'
  | 'library'
  | 'uosvitaAndroid'
  | 'uosvitaIos';

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
  {
    key: 'uosvitaAndroid',
    url: 'https://play.google.com/store/apps/details?id=com.uosvita.app&hl=uk',
    icon: Smartphone,
  },
  {
    key: 'uosvitaIos',
    url: 'https://apps.apple.com/ua/app/u-%D0%BE%D1%81%D0%B2%D1%96%D1%82%D0%B0/id6740523126',
    icon: TabletSmartphone,
  },
];
