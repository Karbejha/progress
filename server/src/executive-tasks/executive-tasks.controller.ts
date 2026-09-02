import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ExecutiveTasksService,
  CreateExecutiveTaskDto,
  UpdateExecutiveTaskDto,
} from './executive-tasks.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role, Priority, TaskStatus } from '@prisma/client';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('executive-tasks')
export class ExecutiveTasksController {
  constructor(private readonly tasksService: ExecutiveTasksService) {}

  @Get()
  getTasks(
    @Request() req: any,
    @Query('directorateId') directorateId?: string,
    @Query('status') status?: TaskStatus,
    @Query('priority') priority?: Priority,
  ) {
    return this.tasksService.getTasks(req.user, { directorateId, status, priority });
  }

  @Get(':id')
  getTaskById(@Request() req: any, @Param('id') id: string) {
    return this.tasksService.getTaskById(req.user, id);
  }

  @Roles(Role.GENERAL_DIRECTOR, Role.ASSISTANT_DIRECTOR)
  @Post()
  createTasks(@Request() req: any, @Body() dto: CreateExecutiveTaskDto) {
    return this.tasksService.createTasks(req.user, dto);
  }

  @Patch(':id')
  updateTask(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateExecutiveTaskDto,
  ) {
    return this.tasksService.updateTask(req.user, id, dto);
  }

  @Roles(Role.GENERAL_DIRECTOR, Role.ASSISTANT_DIRECTOR)
  @Delete(':id')
  deleteTask(
    @Request() req: any,
    @Param('id') id: string,
    @Query('deleteAllInGroup') deleteAllInGroup?: string,
  ) {
    return this.tasksService.deleteTask(req.user, id, { deleteAllInGroup });
  }
}
