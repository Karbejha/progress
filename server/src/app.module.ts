import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { DirectoratesModule } from './directorates/directorates.module';
import { DailyPlansModule } from './daily-plans/daily-plans.module';
import { DailySummariesModule } from './daily-summaries/daily-summaries.module';
import { ExecutiveModule } from './executive/executive.module';
import { ExecutiveTasksModule } from './executive-tasks/executive-tasks.module';
import { EventsModule } from './events/events.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    EventsModule,
    AuthModule,
    UsersModule,
    DirectoratesModule,
    DailyPlansModule,
    DailySummariesModule,
    ExecutiveModule,
    ExecutiveTasksModule,
  ],
})
export class AppModule {}

