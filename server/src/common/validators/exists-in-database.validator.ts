import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Model, Document } from 'mongoose';

@ValidatorConstraint({ name: 'existsInDatabase', async: true })
@Injectable()
export class ExistsInDatabaseConstraint implements ValidatorConstraintInterface {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  async validate(value: any, args: ValidationArguments) {
    if (!value) {
      return true;
    }
    try {
      const [modelName] = args.constraints as [string];
      const model = this.connection.model(modelName) as Model<Document>;
      const doc = await model.findById(value as string).exec();
      return !!doc;
    } catch {
      return false;
    }
  }

  defaultMessage(args: ValidationArguments) {
    const [modelName] = args.constraints as [string]; // Explicitly cast
    return `Document with ID '$value' not found in collection '${modelName}'.`;
  }
}

export function ExistsInDatabase(
  modelName: string,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [modelName],
      validator: ExistsInDatabaseConstraint,
    });
  };
}
