import { Types } from 'mongoose';

export const toId = (value: unknown): string => {
  if (value instanceof Types.ObjectId) return value.toHexString();
  if (typeof value === 'object' && value !== null && '_id' in value) {
    return (value as { _id: Types.ObjectId })._id.toHexString();
  }
  return String(value);
};
