import { Module } from '@nestjs/common';
import { ExecutiveTasksController } from './executive-tasks.controller';
import { ExecutiveTasksService } from './executive-tasks.service';
import { PrismaModule } from '../prisma/prisma.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [PrismaModule, EventsModule],
  controllers: [ExecutiveTasksController],
  providers: [ExecutiveTasksService],
  exports: [ExecutiveTasksService],
})
export class ExecutiveTasksModule {}
