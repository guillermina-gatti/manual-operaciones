import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AccessService } from './access.service';
import { AuthRateLimiterService } from './auth-rate-limiter.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';

@Global()
@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    AuthRateLimiterService,
    SessionService,
    JwtAuthGuard,
    RolesGuard,
    AccessService,
  ],
  exports: [
    AuthService,
    PasswordService,
    AuthRateLimiterService,
    SessionService,
    JwtAuthGuard,
    RolesGuard,
    AccessService,
    JwtModule,
  ],
})
export class AuthModule {}
