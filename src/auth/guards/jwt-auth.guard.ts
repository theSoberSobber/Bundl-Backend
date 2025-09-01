import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  handleRequest(err, user, info) {
    // If there's an error or no user, throw a 401 Unauthorized exception
    if (err || !user) {
      throw new UnauthorizedException('Invalid or expired access token');
    }
    return user;
  }
}
