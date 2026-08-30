import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
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
    this.logger.log('WebSocket Gateway initialized');
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // Real-time broadcast helpers
  emitPlanSubmitted(payload: {
    directorateId: string;
    directorateName: string;
    directorName: string;
    tasksCount: number;
    planDate: string;
  }) {
    this.logger.log(`Broadcasting plan:submitted for ${payload.directorateName}`);
    this.server.emit('plan:submitted', payload);
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
    this.logger.log(`Broadcasting task:updated for ${payload.directorateName}`);
    this.server.emit('task:updated', payload);
  }

  emitSummarySubmitted(payload: {
    directorateId: string;
    directorateName: string;
    directorName: string;
    overallCompletionRate: number;
    urgentFlag: boolean;
    summaryText: string;
  }) {
    this.logger.log(`Broadcasting summary:submitted for ${payload.directorateName}`);
    this.server.emit('summary:submitted', payload);
  }

  emitFeedbackSent(payload: {
    directorateId: string;
    fromUserName: string;
    feedbackText: string;
    rating?: number;
  }) {
    this.logger.log(`Broadcasting feedback:sent to directorate ${payload.directorateId}`);
    this.server.emit('feedback:sent', payload);
  }

  emitAnnouncementCreated(payload: {
    title: string;
    content: string;
    priority: string;
    authorName: string;
  }) {
    this.logger.log(`Broadcasting announcement:created: ${payload.title}`);
    this.server.emit('announcement:created', payload);
  }
}
