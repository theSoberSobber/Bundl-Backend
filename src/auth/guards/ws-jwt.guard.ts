import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';

@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const client: Socket = context.switchToWs().getClient();
      const token = this.extractTokenFromClient(client);

      if (!token) {
        return false;
      }

      const payload = await this.jwtService.verifyAsync(token);
      
      // Attach user info to the client for later use
      (client as any).userId = payload.sub;
      (client as any).user = payload;

      return true;
    } catch (error) {
      return false;
    }
  }

  private extractTokenFromClient(client: Socket): string | null {
    // Try to get token from handshake auth
    const token = client.handshake.auth?.token || 
                 client.handshake.headers?.authorization?.replace('Bearer ', '') ||
                 client.handshake.query?.token;

    return token as string || null;
  }
}
