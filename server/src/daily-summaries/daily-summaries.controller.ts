import { Controller, Get, Post, Body, Query, UseGuards, Request } from '@nestjs/common';
import { DailySummariesService, SubmitSummaryDto } from './daily-summaries.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('daily-summaries')
export class DailySummariesController {
  constructor(private readonly dailySummariesService: DailySummariesService) {}

  @Get('my-today')
  getMyTodaySummary(@Request() req: any, @Query('date') dateStr?: string) {
    return this.dailySummariesService.getMySummary(req.user, dateStr);
  }

  @Post('submit')
  submitSummary(@Request() req: any, @Body() dto: SubmitSummaryDto) {
    return this.dailySummariesService.submitSummary(req.user, dto);
  }
}
