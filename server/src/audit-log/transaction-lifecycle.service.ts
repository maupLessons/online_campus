import { Injectable, Logger } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

type TransactionCallback = () => void | Promise<void>;

type TransactionLifecycleState = {
  afterCommit: TransactionCallback[];
  afterRollback: TransactionCallback[];
  resources: Map<string, unknown>;
};

@Injectable()
export class TransactionLifecycleService {
  private readonly logger = new Logger(TransactionLifecycleService.name);
  private readonly storage = new AsyncLocalStorage<TransactionLifecycleState>();

  async run<T>(callback: () => Promise<T>): Promise<T> {
    const state: TransactionLifecycleState = {
      afterCommit: [],
      afterRollback: [],
      resources: new Map<string, unknown>(),
    };

    return this.storage.run(state, async () => {
      try {
        const result = await callback();
        await this.executeCallbacks(state.afterCommit, 'afterCommit');
        return result;
      } catch (error) {
        await this.executeCallbacks(state.afterRollback, 'afterRollback');
        throw error;
      }
    });
  }

  onRollback(callback: TransactionCallback): boolean {
    const state = this.storage.getStore();
    if (!state) {
      return false;
    }

    state.afterRollback.push(callback);
    return true;
  }

  onCommit(callback: TransactionCallback): boolean {
    const state = this.storage.getStore();
    if (!state) {
      return false;
    }

    state.afterCommit.push(callback);
    return true;
  }

  getOrCreate<T>(key: string, factory: () => T): T {
    const state = this.storage.getStore();
    if (!state) {
      return factory();
    }

    if (!state.resources.has(key)) {
      state.resources.set(key, factory());
    }

    return state.resources.get(key) as T;
  }

  private async executeCallbacks(
    callbacks: TransactionCallback[],
    phase: string,
  ): Promise<void> {
    for (const callback of callbacks) {
      try {
        await callback();
      } catch (error) {
        const code =
          error instanceof Error ? error.name : 'TransactionCallbackError';
        this.logger.error(`${phase} callback failed: ${code}`);
      }
    }
  }
}
