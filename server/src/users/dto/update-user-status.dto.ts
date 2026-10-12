import { IsBoolean } from 'class-validator';

export class UpdateUserStatusDto {
  @IsBoolean({ message: 'حالة الحساب يجب أن تكون قيمة منطقية' })
  isActive: boolean;
}
