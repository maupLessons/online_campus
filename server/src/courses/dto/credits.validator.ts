import { registerDecorator, ValidationOptions } from 'class-validator';

export function isCreditsValue(value: unknown): boolean {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0.5 &&
    value <= 30 &&
    Number.isInteger(value * 2)
  );
}

export function IsCredits(options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'isCreditsValue',
      target: object.constructor,
      propertyName,
      options: { message: 'Кредити — від 0.5 до 30 з кроком 0.5', ...options },
      validator: { validate: (value: unknown) => isCreditsValue(value) },
    });
}
