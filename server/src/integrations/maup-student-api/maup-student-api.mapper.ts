import {
  MaupStudentProfile,
  MaupWireObject,
  MaupWireValue,
} from './maup-student-api.types';

export function mapMaupStudentProfile(
  source: MaupWireObject,
): MaupStudentProfile {
  const externalStudentId = requiredIdentifier(source.student_id, 'student_id');

  return compact({
    externalStudentId,
    firstName: optionalString(source.first_name),
    middleName: optionalString(source.middle_name),
    lastName: optionalString(source.last_name),
    recordBookNumber: optionalString(source.nsb),
    group: compactNestedReference(source.group_id, source.group),
    institute: compactNestedReference(source.institute_id, source.institute),
    course: optionalNumber(source.course),
    studyForm: compactNestedReference(source.form_learn_id, source.form_learn),
    studyLevel: compactNestedReference(
      source.level_learn_id,
      source.level_learn,
    ),
    speciality: optionalString(source.speciality),
    specialization: optionalString(source.specialization),
    qualification: optionalString(source.qualification),
    educationStart: optionalIsoDate(source.education_start),
    // The upstream contract intentionally contains this misspelled wire key.
    educationEnd: optionalIsoDate(source.edication_end),
  });
}

function compact<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as T;
}

function compactNestedReference(
  rawId: MaupWireValue | undefined,
  rawName: MaupWireValue | undefined,
): { externalId?: string; name?: string } | undefined {
  const externalId = optionalIdentifier(rawId);
  const name = optionalString(rawName);
  return externalId || name ? compact({ externalId, name }) : undefined;
}

function requiredIdentifier(value: MaupWireValue | undefined, key: string) {
  const identifier = optionalIdentifier(value);
  if (!identifier) {
    throw new Error(`MAUP API response is missing ${key}`);
  }
  return identifier;
}

function optionalIdentifier(value: MaupWireValue | undefined) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return optionalString(value);
}

function optionalString(value: MaupWireValue | undefined) {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim();
  return normalized || undefined;
}

function optionalNumber(value: MaupWireValue | undefined) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function optionalIsoDate(value: MaupWireValue | undefined) {
  const date = optionalString(value);
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
}
