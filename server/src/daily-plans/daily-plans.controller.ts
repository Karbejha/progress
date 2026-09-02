import { Controller, Get, Post, Delete, Patch, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { DailyPlansService, CreatePlanDto, UpdateTaskDto } from './daily-plans.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Priority } from '@prisma/client';

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

  @Get('clone-previous')
  clonePreviousPlan(@Request() req: any, @Query('date') dateStr?: string) {
    return this.dailyPlansService.clonePreviousPlan(req.user, dateStr);
  }

  @Get('templates')
  getTaskTemplates(@Request() req: any) {
    return this.dailyPlansService.getTaskTemplates(req.user);
  }

  @Post('templates')
  createTaskTemplate(
    @Request() req: any,
    @Body() dto: { title: string; description?: string; priority?: Priority; estimatedHours?: number },
  ) {
    return this.dailyPlansService.createTaskTemplate(req.user, dto);
  }

  @Delete('templates/:id')
  deleteTaskTemplate(@Request() req: any, @Param('id') id: string) {
    return this.dailyPlansService.deleteTaskTemplate(req.user, id);
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
