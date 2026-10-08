import { IsString, IsNotEmpty, IsOptional, IsEnum, IsDateString, IsInt, Min, Max, IsArray, IsUUID, ArrayMaxSize, ArrayUnique } from 'class-validator';
import { Priority } from '@prisma/client';

export class CreateTodoDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(Priority)
  @IsOptional()
  priority?: Priority;

  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  completionPercentage?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  attachmentIds?: string[];
}
