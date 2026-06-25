import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NewsQueryDto } from './dto/news-query.dto';
import { NewsService } from './news.service';

@ApiTags('news')
@ApiBearerAuth()
@Controller('news')
@UseGuards(JwtAuthGuard)
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  @Get()
  @Header('Cache-Control', 'private, max-age=60')
  findLatest(@Query() query: NewsQueryDto) {
    return this.newsService.findLatest(query.limit);
  }
}
