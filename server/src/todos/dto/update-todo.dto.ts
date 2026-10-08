import { IsString, IsOptional, IsEnum, IsDateString, IsBoolean, IsNumber, IsInt, Min, Max, IsArray, IsUUID, ArrayMaxSize, ArrayUnique } from 'class-validator';
import { Priority } from '@prisma/client';

export class UpdateTodoDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(Priority)
  @IsOptional()
  priority?: Priority;

  @IsDateString()
  @IsOptional()
  dueDate?: string | null;

  @IsBoolean()
  @IsOptional()
  isCompleted?: boolean;

  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  completionPercentage?: number;

  @IsString()
  @IsOptional()
  category?: string;

  @IsNumber()
  @IsOptional()
  displayOrder?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  attachmentIds?: string[];
}

