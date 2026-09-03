import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class EventsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger: Logger = new Logger('EventsGateway');

  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway initialized with secure rooms');
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join')
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      userId?: string;
      role?: string;
      directorateId?: string;
    },
  ) {
    if (!data) return;

    // Join general authenticated room
    client.join('room:authenticated');

    if (data.userId) {
      client.join(`room:user_${data.userId}`);
    }

    // Join executive room if leadership
    if (data.role === 'GENERAL_DIRECTOR' || data.role === 'ASSISTANT_DIRECTOR') {
      client.join('room:executive');
      this.logger.log(`Socket ${client.id} joined room:executive (User: ${data.userId || 'Unknown'})`);
    }

    // Join directorate room if assigned
    if (data.directorateId) {
      const dirRoom = `room:directorate_${data.directorateId}`;
      client.join(dirRoom);
      this.logger.log(`Socket ${client.id} joined ${dirRoom}`);
    }

    return { status: 'joined', socketId: client.id };
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
    directorateId: string;
    fromUserName: string;
    feedbackText: string;
    rating?: number;
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
    this.server.emit('announcement:created', payload);
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
}


