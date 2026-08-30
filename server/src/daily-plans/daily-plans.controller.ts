import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { DailyPlansService, CreatePlanDto, UpdateTaskDto } from './daily-plans.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('daily-plans')
export class DailyPlansController {
  constructor(private readonly dailyPlansService: DailyPlansService) {}

  @Get('my-today')
  getMyTodayPlan(@Request() req: any, @Query('date') dateStr?: string) {
    return this.dailyPlansService.getMyPlanForDate(req.user, dateStr);
  }

  @Get('my-history')
  getMyHistory(@Request() req: any, @Query('limit') limit?: string) {
    const take = limit ? parseInt(limit, 10) : 30;
    return this.dailyPlansService.getDirectorHistory(req.user, take);
  }

  @Post('submit')
  createOrUpdatePlan(@Request() req: any, @Body() dto: CreatePlanDto) {
    return this.dailyPlansService.createOrUpdatePlan(req.user, dto);
  }

  @Patch('tasks/:taskId')
  updateTaskStatus(
    @Request() req: any,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.dailyPlansService.updateTaskStatus(req.user, taskId, dto);
  }
}
