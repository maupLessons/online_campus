import { plainToInstance } from 'class-transformer';
import { PaginatedDto } from '../dto/paginated.dto';

export type Constructor<T> = {
  new (...args: any[]): T;
};

export const transformToDto = <T, R>(cls: Constructor<T>, target: R): T =>
  plainToInstance(cls, target, { excludeExtraneousValues: true });

export const transformToDtoArray = <T, R>(
  cls: Constructor<T>,
  target: R[],
): T[] => plainToInstance(cls, target, { excludeExtraneousValues: true });

interface PaginatedResultSource<R> {
  docs: R[];
  totalDocs: number;
  limit: number;
  page?: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  nextPage?: number | null;
  prevPage?: number | null;
}

export const transformToPaginatedDto = <T, R>(
  cls: Constructor<T>,
  {
    docs,
    page,
    nextPage,
    prevPage,
    totalDocs,
    limit,
    totalPages,
    hasNextPage,
    hasPrevPage,
  }: PaginatedResultSource<R>,
): PaginatedDto<T> => ({
  docs: transformToDtoArray(cls, docs),
  totalDocs,
  limit,
  totalPages,
  hasNextPage,
  hasPrevPage,
  page: page ?? 1,
  nextPage: nextPage ?? undefined,
  prevPage: prevPage ?? undefined,
});
