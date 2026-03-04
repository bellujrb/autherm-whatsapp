import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WhatsappService } from './whatsapp.service';
import { MchatService } from './mchat.service';
import { LangGraphModule } from '../langgraph/langgraph.module';
import { AnalyticsModule } from '../analytics/analytics.module';

@Module({
  imports: [ConfigModule, LangGraphModule, AnalyticsModule],
  providers: [WhatsappService, MchatService],
  exports: [WhatsappService],
})
export class WhatsappModule {}
