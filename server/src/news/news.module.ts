import { Module } from '@nestjs/common';
import { NewsController } from './news.controller';
import { NEWS_FEED_FETCH, NewsService } from './news.service';

@Module({
  controllers: [NewsController],
  providers: [
    NewsService,
    {
      provide: NEWS_FEED_FETCH,
      useValue: fetch,
    },
  ],
})
export class NewsModule {}
