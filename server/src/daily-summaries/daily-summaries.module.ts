import { Module } from '@nestjs/common';
import { DailySummariesService } from './daily-summaries.service';
import { DailySummariesController } from './daily-summaries.controller';

@Module({
  controllers: [DailySummariesController],
  providers: [DailySummariesService],
  exports: [DailySummariesService],
})
export class DailySummariesModule {}
