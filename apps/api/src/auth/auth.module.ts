import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthRateLimiterService } from './auth-rate-limiter.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    AuthRateLimiterService,
    SessionService,
  ],
  exports: [
    AuthService,
    PasswordService,
    AuthRateLimiterService,
    SessionService,
    JwtModule,
  ],
})
export class AuthModule {}
