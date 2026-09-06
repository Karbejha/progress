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
import { TodosService } from './todos.service';
import { CreateTodoDto } from './dto/create-todo.dto';
import { UpdateTodoDto } from './dto/update-todo.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Priority } from '@prisma/client';

@UseGuards(JwtAuthGuard)
@Controller('todos')
export class TodosController {
  constructor(private readonly todosService: TodosService) {}

  @Get()
  getTodos(
    @Request() req: any,
    @Query('isCompleted') isCompleted?: string,
    @Query('priority') priority?: Priority | 'ALL',
    @Query('category') category?: string,
    @Query('search') search?: string,
  ) {
    return this.todosService.getTodos(req.user, {
      isCompleted,
      priority,
      category,
      search,
    });
  }

  @Get(':id')
  getTodoById(@Request() req: any, @Param('id') id: string) {
    return this.todosService.getTodoById(req.user, id);
  }

  @Post()
  createTodo(@Request() req: any, @Body() dto: CreateTodoDto) {
    return this.todosService.createTodo(req.user, dto);
  }

  @Patch('reorder')
  reorderTodos(@Request() req: any, @Body('orderedIds') orderedIds: string[]) {
    return this.todosService.reorderTodos(req.user, orderedIds);
  }

  @Patch(':id')
  updateTodo(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateTodoDto,
  ) {
    return this.todosService.updateTodo(req.user, id, dto);
  }

  @Patch(':id/toggle')
  toggleTodo(@Request() req: any, @Param('id') id: string) {
    return this.todosService.toggleTodo(req.user, id);
  }

  @Delete(':id')
  deleteTodo(@Request() req: any, @Param('id') id: string) {
    return this.todosService.deleteTodo(req.user, id);
  }

  @Post(':id/convert-to-plan')
  convertToPlanTask(@Request() req: any, @Param('id') id: string) {
    return this.todosService.convertToPlanTask(req.user, id);
  }

  @Post(':id/convert-to-executive-task')
  convertToExecutiveTask(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { directorateIds: string[]; dueDate?: string },
  ) {
    return this.todosService.convertToExecutiveTask(req.user, id, body);
  }
}
