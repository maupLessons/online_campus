import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { SeedService } from './seed.service';

type SeederMock = {
  seed: jest.Mock<Promise<void>, []>;
};

function createSeeder(): SeederMock {
  const seed = jest.fn<Promise<void>, []>();
  seed.mockResolvedValue(undefined);
  return { seed };
}

function createService(env: Record<string, string | undefined> = {}) {
  const configService = {
    get: jest.fn((key: string) => env[key]),
  } as unknown as ConfigService;

  const seeders = {
    userSeeder: createSeeder(),
    facultySeeder: createSeeder(),
    departmentSeeder: createSeeder(),
    specialtySeeder: createSeeder(),
    classroomSeeder: createSeeder(),
    groupSeeder: createSeeder(),
    courseSeeder: createSeeder(),
    courseAssignmentSeeder: createSeeder(),
    scheduleEntrySeeder: createSeeder(),
    gradeSeeder: createSeeder(),
    assignmentSeeder: createSeeder(),
    materialSeeder: createSeeder(),
  };

  const service = new SeedService(
    configService,
    seeders.userSeeder as never,
    seeders.facultySeeder as never,
    seeders.departmentSeeder as never,
    seeders.specialtySeeder as never,
    seeders.classroomSeeder as never,
    seeders.groupSeeder as never,
    seeders.courseSeeder as never,
    seeders.courseAssignmentSeeder as never,
    seeders.scheduleEntrySeeder as never,
    seeders.gradeSeeder as never,
    seeders.assignmentSeeder as never,
    seeders.materialSeeder as never,
  );

  return { service, seeders };
}

describe('SeedService', () => {
  let loggerLogSpy: jest.SpyInstance;
  let loggerWarnSpy: jest.SpyInstance;
  let loggerErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    loggerLogSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    loggerWarnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    loggerLogSpy.mockRestore();
    loggerWarnSpy.mockRestore();
    loggerErrorSpy.mockRestore();
  });

  it('does not seed demo data unless explicitly enabled', async () => {
    const { service, seeders } = createService({ NODE_ENV: 'development' });

    await service.onModuleInit();

    expect(seeders.userSeeder.seed).not.toHaveBeenCalled();
    expect(seeders.materialSeeder.seed).not.toHaveBeenCalled();
  });

  it('runs demo seeders in development when enabled', async () => {
    const { service, seeders } = createService({
      NODE_ENV: 'development',
      SEED_DEMO_DATA: 'true',
    });

    await service.onModuleInit();

    expect(seeders.userSeeder.seed).toHaveBeenCalledTimes(1);
    expect(seeders.facultySeeder.seed).toHaveBeenCalledTimes(1);
    expect(seeders.materialSeeder.seed).toHaveBeenCalledTimes(1);
  });

  it('blocks demo seeding in production by default', async () => {
    const { service, seeders } = createService({
      NODE_ENV: 'production',
      SEED_DEMO_DATA: 'true',
    });

    await service.onModuleInit();

    expect(seeders.userSeeder.seed).not.toHaveBeenCalled();
    expect(seeders.materialSeeder.seed).not.toHaveBeenCalled();
  });

  it('allows production demo seeding only for explicitly disposable environments', async () => {
    const { service, seeders } = createService({
      NODE_ENV: 'production',
      SEED_DEMO_DATA: 'true',
      SEED_DEMO_DATA_IN_PRODUCTION: 'true',
    });

    await service.onModuleInit();

    expect(seeders.userSeeder.seed).toHaveBeenCalledTimes(1);
    expect(seeders.materialSeeder.seed).toHaveBeenCalledTimes(1);
  });
});
