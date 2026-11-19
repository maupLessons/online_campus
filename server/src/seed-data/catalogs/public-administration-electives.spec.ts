import { PUBLIC_ADMINISTRATION_ELECTIVES } from './public-administration-electives';

describe('public administration electives catalog', () => {
  it('contains the 26 disciplines from the MAUP catalog page', () => {
    expect(PUBLIC_ADMINISTRATION_ELECTIVES).toHaveLength(26);
    expect(
      new Set(PUBLIC_ADMINISTRATION_ELECTIVES.map((e) => e.title)).size,
    ).toBe(26);
    expect(PUBLIC_ADMINISTRATION_ELECTIVES[0]).toEqual({
      title: 'Концептуальні підходи до прийняття управлінських рішень',
      syllabusPath:
        'assets/files/kafedra/publ-admin/vibir-magistr/konceptualni-pidhodi-do-prijnyattya-upravlinskih-rishen.pdf',
    });
    for (const entry of PUBLIC_ADMINISTRATION_ELECTIVES) {
      expect(entry.syllabusPath).toMatch(
        /^assets\/files\/kafedra\/publ-admin\/vibir-magistr\/[\w-]+\.pdf$/,
      );
    }
  });
});
