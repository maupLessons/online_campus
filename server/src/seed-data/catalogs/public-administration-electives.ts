import { Logger } from '@nestjs/common';
import type { Db } from 'mongodb';
import {
  GENERATED_ELECTIVE_CODE,
  insertWithGeneratedCode,
} from '../../elective-disciplines/elective-code';

export const PUBLIC_ADMINISTRATION_FACULTY = 'Інститут економіки';
export const PUBLIC_ADMINISTRATION_DEPARTMENT =
  'Кафедра публічного адміністрування';
export const SYLLABUS_BASE_URL = 'https://maup.com.ua/';

export const PUBLIC_ADMINISTRATION_ELECTIVES: ReadonlyArray<{
  title: string;
  syllabusPath: string;
}> = [
  {
    title: 'Концептуальні підходи до прийняття управлінських рішень',
    syllabusPath:
      'assets/files/kafedra/publ-admin/vibir-magistr/konceptualni-pidhodi-do-prijnyattya-upravlinskih-rishen.pdf',
  },
  {
    title: 'Комунікативна політика та PR-технології у державному управлінні',
    syllabusPath:
      'assets/files/kafedra/publ-admin/vibir-magistr/komunpolitika-ta-pr.pdf',
  },
  {
    title: 'Антикризове управління в територіальних громадах',
    syllabusPath:
      'assets/files/kafedra/publ-admin/vibir-magistr/antikrizove-upravlinnya-v-teritorialnih-gromadah.pdf',
  },
  {
    title: 'Управління програмами та проєктами в публічному управлінні',
    syllabusPath:
      'assets/files/kafedra/publ-admin/vibir-magistr/upravlinnya-proektami-ta-programami.pdf',
  },
  {
    title: 'Соціальна та гуманітарна політика',
    syllabusPath:
      'assets/files/kafedra/publ-admin/vibir-magistr/socialna-ta-gumanitarnv-politika.pdf',
  },
  {
    title: 'Публічне управління в економічній сфері',
    syllabusPath:
      'assets/files/kafedra/publ-admin/vibir-magistr/publichne-upravlinnya-v-ekonomichnij-sferi.pdf',
  },
  {
    title: 'Електронне врядування',
    syllabusPath:
      'assets/files/kafedra/publ-admin/vibir-magistr/elektronne-vryaduvannya.pdf',
  },
  {
    title: 'Парламентаризм',
    syllabusPath:
      'assets/files/kafedra/publ-admin/vibir-magistr/parlamentarizm.pdf',
  },
  {
    title: 'Аналітична діяльність',
    syllabusPath:
      'assets/files/kafedra/publ-admin/vibir-magistr/analitichna-diyalnist.pdf',
  },
  {
    title: 'Належне врядування та сервісна держава',
    syllabusPath:
      'assets/files/kafedra/publ-admin/vibir-magistr/nalezhne_vryaduvannya_ta_servisna_derzhava.pdf',
  },
  {
    title: 'Управління якістю публічних послуг',
    syllabusPath:
      'assets/files/kafedra/publ-admin/vibir-magistr/upravlinnya-yakistyu-publichnih-poslug.pdf',
  },
  {
    title: 'Управління соціальним і гуманітарним розвитком',
    syllabusPath:
      'assets/files/kafedra/publ-admin/vibir-magistr/upravlinnya-socialnim-ta-gumanitarnim-rozvitkom.pdf',
  },
  {
    title: 'Лідерство на публічній службі',
    syllabusPath:
      'assets/files/kafedra/publ-admin/vibir-magistr/liderstov-na-publichnij-sluzhbi.pdf',
  },
  {
    title: 'Лідерство та управління організаційною культурою',
    syllabusPath:
      'assets/files/kafedra/publ-admin/vibir-magistr/liderstvo-ta-upravlinnya-organizacijnoyu-kulturoyu.pdf',
  },
  {
    title: 'Тренінг з партисипації у стратегуванні розвитку громади',
    syllabusPath:
      'assets/files/kafedra/publ-admin/vibir-magistr/trening-z-partisipacii-u-strateguvanni-rozvitku-gromadi.pdf',
  },
  {
    title: 'Основи сталого розвитку суспільства',
    syllabusPath:
      'assets/files/kafedra/publ-admin/vibir-magistr/osnovi-stalogo-rozvitku-suspilstva.pdf',
  },
  {
    title: 'Етика в публічній службі',
    syllabusPath:
      'assets/files/kafedra/publ-admin/vibir-magistr/etika-v-publichnij-sluzhbi.pdf',
  },
  {
    title: 'Консалтинг у публічному управлінні',
    syllabusPath:
      'assets/files/kafedra/publ-admin/vibir-magistr/konsalting-u-publichnomu-upravlinni.pdf',
  },
  {
    title: 'Регіональний розвиток та взаємодія влади і громади',
    syllabusPath:
      'assets/files/kafedra/publ-admin/vibir-magistr/regionalnij_rozvitok_ta_vzaemodiya_vladi_i_gromadi.pdf',
  },
  {
    title: 'Командоутворення та управління конфліктами у публічному управлінні',
    syllabusPath:
      'assets/files/kafedra/publ-admin/vibir-magistr/komandoutvorennya_ta_upravlinnya_konfliktami.pdf',
  },
  {
    title: 'Документообіг та підготовка аналітичних документів',
    syllabusPath:
      'assets/files/kafedra/publ-admin/vibir-magistr/dokumentoobig-ta-pidgotovka-analitichnih-dokumentiv.pdf',
  },
  {
    title: 'Організація управління містом',
    syllabusPath:
      'assets/files/kafedra/publ-admin/vibir-magistr/organizaciya_upravlinnya_mistom.pdf',
  },
  {
    title: 'Адміністрування суспільних благ',
    syllabusPath:
      'assets/files/kafedra/publ-admin/vibir-magistr/adminstruvannya-suspilnih-blag.pdf',
  },
  {
    title: 'Світовий досвід організації публічної служби',
    syllabusPath:
      'assets/files/kafedra/publ-admin/vibir-magistr/svitovij-dosvid-organizacij-publichnoi-sluzhbi.pdf',
  },
  {
    title: 'Робота з організаціями громадянського суспільства',
    syllabusPath:
      'assets/files/kafedra/publ-admin/vibir-magistr/robota-z-organizaciyami-gromadskogo-suspilstva.pdf',
  },
  {
    title: 'Тренінг з розвитку особистісного потенціалу',
    syllabusPath:
      'assets/files/kafedra/publ-admin/vibir-magistr/trening_z_rozvitku.pdf',
  },
];

export async function upsertPublicAdministrationCatalog(
  db: Db,
  logger: Pick<Logger, 'log' | 'warn'>,
): Promise<{ disciplinesInserted: number }> {
  const now = new Date();

  const faculty = await db.collection('faculties').findOneAndUpdate(
    { name: PUBLIC_ADMINISTRATION_FACULTY },
    {
      $setOnInsert: {
        name: PUBLIC_ADMINISTRATION_FACULTY,
        createdAt: now,
        updatedAt: now,
      },
    },
    { upsert: true, returnDocument: 'after' },
  );
  if (!faculty) {
    throw new Error('Failed to upsert the public administration faculty');
  }

  const department = await db.collection('departments').findOneAndUpdate(
    { faculty: faculty._id, name: PUBLIC_ADMINISTRATION_DEPARTMENT },
    {
      $setOnInsert: {
        faculty: faculty._id,
        name: PUBLIC_ADMINISTRATION_DEPARTMENT,
        createdAt: now,
        updatedAt: now,
      },
    },
    { upsert: true, returnDocument: 'after' },
  );
  if (!department) {
    throw new Error('Failed to upsert the public administration department');
  }

  const term = await db
    .collection('academicterms')
    .findOne({ status: 'current' });
  const admin = await db
    .collection('users')
    .findOne({ role: 'admin' }, { sort: { createdAt: 1 } });
  if (!term || !admin) {
    logger.warn(
      'Public administration catalog skipped: no current academic term / admin',
    );
    return { disciplinesInserted: 0 };
  }

  const disciplines = db.collection('electivedisciplines');
  let disciplinesInserted = 0;
  for (const entry of PUBLIC_ADMINISTRATION_ELECTIVES) {
    const existing = await disciplines.findOne({
      term: term._id,
      department: department._id,
      title: entry.title,
    });
    if (existing) {
      continue;
    }
    await insertWithGeneratedCode({
      academicYear: term.academicYear as string,
      termNumber: term.termNumber as 1 | 2,
      loadCodes: () =>
        disciplines.distinct('code', {
          term: term._id,
          code: GENERATED_ELECTIVE_CODE,
        }) as Promise<string[]>,
      insert: (code) =>
        disciplines.insertOne({
          code,
          title: entry.title,
          department: department._id,
          teacher: null,
          term: term._id,
          credits: 3,
          capacity: 30,
          enrolledCount: 0,
          status: 'active',
          syllabusUrl: SYLLABUS_BASE_URL + entry.syllabusPath,
          createdBy: admin._id,
          createdAt: now,
          updatedAt: now,
        }),
    });
    disciplinesInserted += 1;
  }

  logger.log(
    `Public administration catalog: ${disciplinesInserted} disciplines inserted`,
  );
  return { disciplinesInserted };
}
