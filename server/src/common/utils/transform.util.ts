import { plainToInstance } from 'class-transformer';

export type Constructor<T> = {
  new (...args: any[]): T;
};

export const transformToDto = <T, R>(cls: Constructor<T>, target: R): T =>
  plainToInstance(cls, target, { excludeExtraneousValues: true });

export const transformToDtoArray = <T, R>(
  cls: Constructor<T>,
  target: R[],
): T[] => plainToInstance(cls, target, { excludeExtraneousValues: true });
