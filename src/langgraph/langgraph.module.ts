import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { OpenAIModelService } from './services/openai-model.service';

import { ConversationAgent } from './agents/conversation.agent';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [OpenAIModelService, ConversationAgent],
  exports: [OpenAIModelService, ConversationAgent],
})
export class LangGraphModule {}
