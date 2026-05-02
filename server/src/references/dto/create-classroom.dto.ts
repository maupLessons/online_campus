import { IsString, IsNotEmpty, IsNumber, IsEnum } from 'class-validator';

export class CreateClassroomDto {
  @IsString()
  @IsNotEmpty()
  building: string;

  @IsString()
  @IsNotEmpty()
  roomNumber: string;

  @IsNumber()
  @IsNotEmpty()
  capacity: number;

  @IsEnum(['lecture', 'lab', 'seminar', 'online'])
  @IsNotEmpty()
  type: string;
}
