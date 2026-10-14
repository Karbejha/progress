import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Notification, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type SocketUser = { id: string; role: Role; directorateId: string | null; isActive: boolean };

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class EventsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger: Logger = new Logger('EventsGateway');

  constructor(private jwtService: JwtService, private prisma: PrismaService) {}

  afterInit(server: Server) {
    // Authenticate before Socket.IO accepts the connection or any room request.
    server.use(async (client, next) => {
      try {
        const authorization = client.handshake.headers.authorization;
        const token = client.handshake.auth?.token ||
          (typeof authorization === 'string' && authorization.startsWith('Bearer ')
            ? authorization.slice(7)
            : null);
        if (typeof token !== 'string' || !token) throw new Error('Missing token');
        const payload = await this.jwtService.verifyAsync<{ sub: string; exp?: number }>(token);
        if (typeof payload.sub !== 'string' || !payload.sub) throw new Error('Missing user');
        const user = await this.findSocketUser(payload.sub);
        if (!user?.isActive) throw new Error('Inactive user');
        client.data.authenticatedUser = user;
        client.data.tokenExpiresAt = payload.exp;
        next();
      } catch {
        next(new Error('Unauthorized'));
      }
    });
    this.logger.log('WebSocket Gateway initialized with secure rooms');
  }

  async handleConnection(client: Socket) {
    const user = client.data.authenticatedUser as SocketUser | undefined;
    if (!user?.isActive) {
      client.disconnect(true);
      return;
    }
    // An established connection must not continue delivering private data after
    // the JWT expires. Reconnecting then goes through authentication again.
    if (client.data.tokenExpiresAt) {
      const remainingMs = client.data.tokenExpiresAt * 1000 - Date.now();
      if (remainingMs <= 0) {
        client.disconnect(true);
        return;
      }
      const expiryTimer = setTimeout(() => client.disconnect(true), remainingMs);
      expiryTimer.unref();
      client.data.expiryTimer = expiryTimer;
    }
    await this.joinAuthenticatedRooms(client, user);
    this.logger.log(`Authenticated client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    if (client.data.expiryTimer) clearTimeout(client.data.expiryTimer);
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join')
  async handleJoinRoom(@ConnectedSocket() client: Socket) {
    // The legacy join payload is intentionally ignored: identity, role and
    // directorate are always obtained from the verified session and database.
    const id = (client.data.authenticatedUser as SocketUser | undefined)?.id;
    const user = id ? await this.findSocketUser(id) : null;
    if (!user?.isActive) {
      client.disconnect(true);
      return { status: 'unauthorized' };
    }
    await this.joinAuthenticatedRooms(client, user);
    return { status: 'joined', socketId: client.id };
  }

  private findSocketUser(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, directorateId: true, isActive: true },
    });
  }

  private async joinAuthenticatedRooms(client: Socket, user: SocketUser) {
    const rooms = ['room:authenticated', `room:user_${user.id}`];
    if (user.role === Role.GENERAL_DIRECTOR || user.role === Role.ASSISTANT_DIRECTOR || user.role === Role.OBSERVER) {
      rooms.push('room:executive');
    }
    if (user.directorateId) rooms.push(`room:directorate_${user.directorateId}`);
    for (const room of (client.data.authenticatedRooms || []) as string[]) {
      if (!rooms.includes(room)) await client.leave(room);
    }
    await client.join(rooms);
    client.data.authenticatedRooms = rooms;
    client.data.authenticatedUser = user;
  }

  emitNotificationCreated(userId: string, notification: Notification) {
    this.server.to(`room:user_${userId}`).emit('notification:created', notification);
  }

  emitNotificationsRead(userId: string, readKeys: string[]) {
    this.server.to(`room:user_${userId}`).emit('notifications:read', { readKeys });
  }

  disconnectUserSessions(userId: string) {
    this.server.in(`room:user_${userId}`).disconnectSockets(true);
  }

  // Real-time broadcast helpers to targeted rooms
  emitPlanSubmitted(payload: {
    directorateId: string;
    directorateName: string;
    directorName: string;
    tasksCount: number;
    planDate: string;
  }) {
    this.logger.log(`Broadcasting plan:submitted for ${payload.directorateName} to room:executive and room:directorate_${payload.directorateId}`);
    this.server.to('room:executive').to(`room:directorate_${payload.directorateId}`).emit('plan:submitted', payload);
  }

  emitTaskUpdated(payload: {
    directorateId: string;
    directorateName: string;
    taskId: string;
    taskTitle: string;
    status: string;
    completionPercentage: number;
    completionNote?: string;
  }) {
    this.logger.log(`Broadcasting task:updated for ${payload.directorateName} to room:executive and room:directorate_${payload.directorateId}`);
    this.server.to('room:executive').to(`room:directorate_${payload.directorateId}`).emit('task:updated', payload);
  }

  emitSummarySubmitted(payload: {
    directorateId: string;
    directorateName: string;
    directorName: string;
    overallCompletionRate: number;
    urgentFlag: boolean;
    summaryText: string;
  }) {
    this.logger.log(`Broadcasting summary:submitted for ${payload.directorateName} to room:executive and room:directorate_${payload.directorateId}`);
    this.server.to('room:executive').to(`room:directorate_${payload.directorateId}`).emit('summary:submitted', payload);
  }

  emitFeedbackSent(payload: {
    feedbackId?: string;
    directorateId: string;
    fromUserId?: string;
    fromUserName: string;
    feedbackText: string;
    rating?: number;
    fromRole?: string;
    fromUserTitle?: string;
    directorateName?: string;
    isReply?: boolean;
    dailyPlanId?: string;
  }) {
    this.logger.log(`Broadcasting feedback:sent to room:directorate_${payload.directorateId} and room:executive`);
    this.server.to(`room:directorate_${payload.directorateId}`).to('room:executive').emit('feedback:sent', payload);
  }

  emitAnnouncementCreated(payload: {
    id?: string;
    title: string;
    content: string;
    priority: string;
    authorId?: string;
    authorName: string;
    createdAt?: string;
  }) {
    this.logger.log(`Broadcasting announcement:created: ${payload.title} to all connected clients`);
    this.server.to('room:authenticated').emit('announcement:created', payload);
  }

  emitExecutiveTaskCreated(payload: {
    task: any;
    directorateId: string;
    directorateName: string;
    assignedByName: string;
  }) {
    this.logger.log(`Broadcasting executive-task:created to room:directorate_${payload.directorateId} and room:executive`);
    this.server.to(`room:directorate_${payload.directorateId}`).to('room:executive').emit('executive-task:created', payload);
  }

  emitExecutiveTaskUpdated(payload: {
    task: any;
    directorateId: string;
    directorateName: string;
    updatedByRole: string;
  }) {
    this.logger.log(`Broadcasting executive-task:updated for task ${payload.task.id} to targeted rooms`);
    this.server.to(`room:directorate_${payload.directorateId}`).to('room:executive').emit('executive-task:updated', payload);
  }

  emitExecutiveTaskDeleted(payload: {
    taskId: string;
    directorateId: string;
  }) {
    this.logger.log(`Broadcasting executive-task:deleted for task ${payload.taskId} to targeted rooms`);
    this.server.to(`room:directorate_${payload.directorateId}`).to('room:executive').emit('executive-task:deleted', payload);
  }

  emitTodoUpdated(userId: string) {
    this.logger.log(`Broadcasting todo:updated for user ${userId}`);
    this.server.to(`room:user_${userId}`).emit('todo:updated', { userId });
  }

  emitUserStatusChanged(payload: { userId: string; directorateId: string | null; isActive: boolean }) {
    this.server.to('room:authenticated').emit('user:status-changed', payload);
    if (!payload.isActive) this.disconnectUserSessions(payload.userId);
  }
}


