import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { MaupStudentApiError } from '../integrations/maup-student-api/maup-student-api.error';
import {
  ExternalDataDisabledException,
  ExternalDataUnavailableException,
} from './external-data.exceptions';
import {
  ExternalDataCache,
  ExternalDataCacheDocument,
  ExternalDataKind,
} from './schemas/external-data-cache.schema';

export type ExternalDataKey = {
  userId: string;
  studentProfileId: string;
  kind: ExternalDataKind;
};

export type ExternalDataResult<T> = {
  payload: T;
  fetchedAt: Date;
  stale: boolean;
};

type CachedRow = {
  payload: unknown;
  fetchedAt: Date;
  freshUntil: Date;
  purgeAt: Date;
};

@Injectable()
export class ExternalDataCacheService {
  private readonly logger = new Logger(ExternalDataCacheService.name);
  private readonly maupEnabled: boolean;
  private readonly ttlMs: number;
  private readonly staleMs: number;

  constructor(
    @InjectModel(ExternalDataCache.name)
    private readonly model: Model<ExternalDataCacheDocument>,
    config: ConfigService,
  ) {
    this.maupEnabled = config.get<string>('MAUP_API_ENABLED') === 'true';
    this.ttlMs = readSeconds(config, 'EXTERNAL_CACHE_TTL_SECONDS', 900) * 1000;
    this.staleMs =
      readSeconds(config, 'EXTERNAL_CACHE_STALE_SECONDS', 86_400) * 1000;
  }

  async resolve<T>(
    key: ExternalDataKey,
    loader: () => Promise<T>,
    options: { force?: boolean } = {},
  ): Promise<ExternalDataResult<T>> {
    // Спека §5 п.2 — раніше за читання кешу: вимкнена інтеграція завжди 503.
    if (!this.maupEnabled) {
      throw new ExternalDataDisabledException();
    }

    const filter = this.toFilter(key);
    const now = Date.now();
    const cached = await this.model.findOne(filter).lean<CachedRow>().exec();

    if (cached && !options.force && cached.freshUntil.getTime() > now) {
      return {
        payload: cached.payload as T,
        fetchedAt: cached.fetchedAt,
        stale: false,
      };
    }

    const startedAt = Date.now();
    let payload: T;
    try {
      payload = await loader();
    } catch (error: unknown) {
      const errorKind =
        error instanceof MaupStudentApiError ? error.kind : 'unknown';
      this.logger.warn(
        `external data refresh failed kind=${key.kind} errorKind=${errorKind} durationMs=${Date.now() - startedAt}`,
      );
      if (errorKind === 'disabled') {
        throw new ExternalDataDisabledException();
      }
      if (cached && cached.purgeAt.getTime() > now) {
        return {
          payload: cached.payload as T,
          fetchedAt: cached.fetchedAt,
          stale: true,
        };
      }
      throw new ExternalDataUnavailableException();
    }

    // Loader succeeded: the fresh payload is returned below regardless of whether the
    // cache write succeeds. A write failure (duplicate-key race between two concurrent
    // requests for the same student, primary stepdown, write timeout) is not a MAUP
    // outage and must not turn a successful fetch into a stale/503 response.
    const fetchedAt = new Date();
    const freshUntil = new Date(fetchedAt.getTime() + this.ttlMs);
    try {
      await this.model
        .findOneAndUpdate(
          filter,
          {
            $set: {
              payload,
              fetchedAt,
              freshUntil,
              purgeAt: new Date(freshUntil.getTime() + this.staleMs),
            },
          },
          { upsert: true, returnDocument: 'after' },
        )
        .exec();
      this.logger.log(
        `external data refreshed kind=${key.kind} durationMs=${Date.now() - startedAt}`,
      );
    } catch {
      this.logger.warn(
        `external data cache write failed kind=${key.kind} durationMs=${Date.now() - startedAt}`,
      );
    }
    return { payload, fetchedAt, stale: false };
  }

  async purgeForUser(userId: string): Promise<number> {
    const result = await this.model
      .deleteMany({ userId: new Types.ObjectId(userId) })
      .exec();
    return result.deletedCount ?? 0;
  }

  private toFilter(key: ExternalDataKey) {
    return {
      userId: new Types.ObjectId(key.userId),
      studentProfileId: new Types.ObjectId(key.studentProfileId),
      kind: key.kind,
    };
  }
}

function readSeconds(config: ConfigService, key: string, fallback: number) {
  const value = Number(config.get<string>(key));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
