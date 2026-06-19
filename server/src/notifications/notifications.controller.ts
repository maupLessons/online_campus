import {
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Body,
  Request,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import type { Observable } from 'rxjs';

import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/types/authenticated-request';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { Role } from '../common/types/roles.enum';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { UpdateNotificationDto } from './dto/update-notification.dto';
import { NotificationsRealtimeService } from './notifications-realtime.service';
import { NotificationQueryDto } from './dto/notification-query.dto';

import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(
    private notificationsService: NotificationsService,
    private readonly realtime: NotificationsRealtimeService,
  ) {}

  @Sse('stream')
  @Header('Cache-Control', 'private, no-cache, no-transform')
  @Header('X-Accel-Buffering', 'no')
  stream(@Request() req: AuthenticatedRequest): Observable<MessageEvent> {
    return this.realtime.stream(req.user.sub);
  }

  @Get()
  findMy(
    @Query() query: NotificationQueryDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.notificationsService.findByUser(req.user.sub, query);
  }

  @Get('unread-count')
  async getUnreadCount(@Request() req: AuthenticatedRequest) {
    const count = await this.notificationsService.getUnreadCount(req.user.sub);
    return { count };
  }

  @Get('admin')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  findAllForAdmin(
    @Query() query: NotificationQueryDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.notificationsService.findAllForAdmin(req.user.sub, query);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  create(@Body() body: CreateNotificationDto) {
    return this.notificationsService.create(body);
  }

  @Post('broadcast')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  broadcast(@Body() body: CreateNotificationDto) {
    return this.notificationsService.create(body);
  }

  @Patch('read-all')
  markAllAsRead(@Request() req: AuthenticatedRequest) {
    return this.notificationsService.markAllAsRead(req.user.sub);
  }

  @Patch(':id/read')
  markAsRead(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.notificationsService.markAsRead(id, req.user.sub);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  update(
    @Param('id') id: string,
    @Body() body: UpdateNotificationDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.notificationsService.update(id, body, req.user.sub);
  }

  @Delete('admin/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  deleteAsAdmin(@Param('id') id: string) {
    return this.notificationsService.deleteAsAdmin(id);
  }

  @Delete(':id')
  delete(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.notificationsService.delete(id, req.user.sub);
  }

  @Delete()
  dismissAll(@Request() req: AuthenticatedRequest) {
    return this.notificationsService.dismissAll(req.user.sub);
  }
}
