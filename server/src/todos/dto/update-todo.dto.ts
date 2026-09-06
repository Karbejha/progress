import { IsString, IsOptional, IsEnum, IsDateString, IsBoolean, IsNumber } from 'class-validator';
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

  @IsString()
  @IsOptional()
  category?: string;

  @IsNumber()
  @IsOptional()
  displayOrder?: number;
}
