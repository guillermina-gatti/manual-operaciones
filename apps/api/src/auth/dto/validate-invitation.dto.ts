import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';
import { INVITATION_TOKEN_BASE64URL_REGEX } from '../token.utils';

export class ValidateInvitationDto {
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
}
