import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';

@Injectable()
export class OpenAIModelService {
  private readonly logger = new Logger(OpenAIModelService.name);

  constructor(private readonly configService: ConfigService) {}

  createLLM(model: string = 'gpt-4o-mini'): ChatOpenAI {
    const openaiApiKey = this.configService.get<string>('OPENAI_API_KEY');

    if (!openaiApiKey) {
      this.logger.warn('⚠️  OPENAI_API_KEY não encontrada');
      throw new Error('OPENAI_API_KEY é obrigatória');
    }

    return new ChatOpenAI({
      model,
      apiKey: openaiApiKey,
      temperature: 0.7,
      maxTokens: 400,
    });
  }

  getGPT4oMini(): ChatOpenAI {
    return this.createLLM('gpt-4o-mini');
  }

  getGPT4o(): ChatOpenAI {
    return this.createLLM('gpt-4o');
  }

  getAvailableModels(): string[] {
    return ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'];
  }
}

