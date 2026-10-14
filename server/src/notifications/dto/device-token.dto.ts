import { IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class DeviceTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  @Matches(/^\S+$/)
  token: string;
}

export class RegisterDeviceTokenDto extends DeviceTokenDto {
  @IsOptional()
  @IsIn(['android', 'ios', 'web'])
  platform?: string;
}
