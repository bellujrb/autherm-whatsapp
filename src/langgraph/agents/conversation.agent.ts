import { Injectable } from '@nestjs/common';
import { BaseAgent } from './base/base-agent';
import { AgentContext, AgentResponse } from '../types/agent.types';
import { LANGGRAPH_SYSTEM_PROMPTS, LANGGRAPH_AI_MODELS } from '../constants/langgraph.constants';
import { OpenAIModelService } from '../services/openai-model.service';

@Injectable()
export class ConversationAgent extends BaseAgent {
  constructor(openAIService: OpenAIModelService) {
    super(openAIService, LANGGRAPH_AI_MODELS.CONTEXT_GENERATION, 0.7);
  }

  async process(input: string, context: AgentContext): Promise<AgentResponse> {
    const startTime = Date.now();

    try {
      const messages: any[] = [
        {
          role: 'system',
          content: LANGGRAPH_SYSTEM_PROMPTS.BASE_IDENTITY,
        },
      ];

      // Log do histórico para debug
      const historyCount = context.conversationHistory?.length || 0;
      console.log(`📝 Histórico de conversa: ${historyCount} mensagens`);

      if (context.conversationHistory && context.conversationHistory.length > 0) {
        const recentHistory = context.conversationHistory.slice(-8);
        messages.push(...recentHistory);
        console.log(`✅ Usando ${recentHistory.length} mensagens do histórico`);
      } else {
        console.log(`🆕 Primeira conversa (sem histórico)`);
      }

      messages.push({
        role: 'user',
        content: input,
      });

      const llmResponse = await this.llm.invoke(messages);
      const executionTime = Date.now() - startTime;

      return this.createSuccessResponse(
        String(llmResponse.content),
        context,
        'conversation',
        executionTime,
      );
    } catch (error) {
      return this.createErrorResponse(error.message, context, 'conversation');
    }
  }

  async canHandle(input: string, context: AgentContext): Promise<boolean> {
    return true;
  }
}
