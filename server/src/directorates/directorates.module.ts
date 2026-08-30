import { Module } from '@nestjs/common';
import { DirectoratesService } from './directorates.service';
import { DirectoratesController } from './directorates.controller';

@Module({
  controllers: [DirectoratesController],
  providers: [DirectoratesService],
  exports: [DirectoratesService],
})
export class DirectoratesModule {}
