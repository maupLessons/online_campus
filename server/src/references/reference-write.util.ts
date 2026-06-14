import { ConflictException } from '@nestjs/common';

type MongoServerErrorLike = {
  code?: number;
  keyPattern?: Record<string, unknown>;
};

export async function executeReferenceWrite<T>(
  operation: () => Promise<T>,
  resourceName: string,
): Promise<T> {
  try {
    return await operation();
  } catch (error: unknown) {
    const mongoError = error as MongoServerErrorLike;
    if (mongoError?.code === 11000) {
      const fields = Object.keys(mongoError.keyPattern ?? {});
      throw new ConflictException({
        message: `${resourceName} with the same unique fields already exists`,
        fields,
      });
    }
    throw error;
  }
}
