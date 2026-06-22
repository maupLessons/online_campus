import { mapMaupStudentProfile } from './maup-student-api.mapper';

describe('mapMaupStudentProfile', () => {
  it('normalizes documented wire fields without copying sensitive values', () => {
    const result = mapMaupStudentProfile({
      student_id: 42,
      first_name: ' Марія ',
      last_name: 'Коваль',
      nsb: 'КН-42',
      ipn: '0000000000',
      price: 12_345,
      group_id: 7,
      group: 'КН-21',
      institute_id: '3',
      institute: 'Інститут компʼютерних наук',
      course: '4',
      edication_end: '2027-06-30',
    });

    expect(result).toEqual({
      externalStudentId: '42',
      firstName: 'Марія',
      lastName: 'Коваль',
      recordBookNumber: 'КН-42',
      group: { externalId: '7', name: 'КН-21' },
      institute: {
        externalId: '3',
        name: 'Інститут компʼютерних наук',
      },
      course: 4,
      educationEnd: '2027-06-30',
    });
    expect(result).not.toHaveProperty('ipn');
    expect(result).not.toHaveProperty('price');
  });

  it('requires the immutable external student identifier', () => {
    expect(() => mapMaupStudentProfile({ first_name: 'Марія' })).toThrow(
      /student_id/,
    );
  });
});
