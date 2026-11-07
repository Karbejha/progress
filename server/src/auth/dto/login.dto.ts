import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString({ message: 'اسم المستخدم أو البريد الإلكتروني مطلوب' })
  @IsNotEmpty({ message: 'اسم المستخدم أو البريد الإلكتروني مطلوب' })
  usernameOrEmail: string;

  @IsString({ message: 'كلمة المرور مطلوبة' })
  @IsNotEmpty({ message: 'كلمة المرور مطلوبة' })
  password: string;
}
