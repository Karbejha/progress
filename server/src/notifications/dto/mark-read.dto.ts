import { ArrayMaxSize, IsArray, IsString, MaxLength } from 'class-validator';

export class MarkNotificationsReadDto {
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @MaxLength(1024, { each: true })
  keys: string[];
}
