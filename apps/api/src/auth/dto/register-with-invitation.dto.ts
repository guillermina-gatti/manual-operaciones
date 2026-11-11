import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { INVITATION_TOKEN_BASE64URL_REGEX } from '../token.utils';

export class RegisterWithInvitationDto {
  @ApiProperty({
    description: 'Token opaco de invitación en formato base64url de 43 caracteres',
    example: 'V1StGXR8_Z5jdHi6B-myTEYWgkUVnxI4463m48EEUIU',
  })
  @IsString({ message: 'El token debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El token es requerido' })
  @Matches(INVITATION_TOKEN_BASE64URL_REGEX, {
    message: 'El token de invitación debe ser una cadena base64url válida de 43 caracteres',
  })
  token!: string;

  @ApiProperty({
    description: 'Nombre completo del nuevo usuario',
    example: 'Elena Empleada',
    minLength: 2,
    maxLength: 100,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre es requerido' })
  @Length(2, 100, {
    message: 'El nombre debe tener entre 2 y 100 caracteres',
  })
  name!: string;

  @ApiProperty({
    description: 'Contraseña en texto plano para la nueva cuenta',
    example: 'MiClaveSegura2026!',
    minLength: 8,
    maxLength: 128,
  })
  @IsString({ message: 'La contraseña debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'La contraseña es requerida' })
  @MinLength(8, {
    message: 'La contraseña debe tener al menos 8 caracteres',
  })
  @MaxLength(128, {
    message: 'La contraseña no puede exceder los 128 caracteres',
  })
  password!: string;
}
