import { Logger } from '@nestjs/common';
import { TransactionLifecycleService } from './transaction-lifecycle.service';

describe('TransactionLifecycleService', () => {
  let service: TransactionLifecycleService;
  let loggerErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    service = new TransactionLifecycleService();
    loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    loggerErrorSpy.mockRestore();
  });

  it('runs commit callbacks and keeps retry resources stable', async () => {
    const committed = jest.fn();
    const rolledBack = jest.fn();
    const factory = jest.fn(() => 'stable-resource');

    const result = await service.run(() => {
      service.onCommit(committed);
      service.onRollback(rolledBack);

      expect(service.getOrCreate('resource', factory)).toBe('stable-resource');
      expect(service.getOrCreate('resource', factory)).toBe('stable-resource');
      return Promise.resolve('ok');
    });

    expect(result).toBe('ok');
    expect(factory).toHaveBeenCalledTimes(1);
    expect(committed).toHaveBeenCalledTimes(1);
    expect(rolledBack).not.toHaveBeenCalled();
  });

  it('runs rollback callbacks when the transaction fails', async () => {
    const committed = jest.fn();
    const rolledBack = jest.fn();

    await expect(
      service.run(() => {
        service.onCommit(committed);
        service.onRollback(rolledBack);
        return Promise.reject(new Error('transaction failed'));
      }),
    ).rejects.toThrow('transaction failed');

    expect(rolledBack).toHaveBeenCalledTimes(1);
    expect(committed).not.toHaveBeenCalled();
  });

  it('isolates callback failures from the completed transaction result', async () => {
    const result = await service.run(() => {
      service.onCommit(() => {
        throw new Error('cleanup failed');
      });
      return Promise.resolve('committed');
    });

    expect(result).toBe('committed');
    expect(loggerErrorSpy).toHaveBeenCalledWith(
      'afterCommit callback failed: Error',
    );
  });
});
