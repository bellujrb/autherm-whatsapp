import { ChatOpenAI } from '@langchain/openai';
import { AgentContext, AgentResponse } from '../../types/agent.types';

export abstract class BaseAgent {
  protected llm: ChatOpenAI;

  constructor(protected readonly modelService: any, model: string, temperature: number = 0.7) {
    this.llm = modelService.createLLM(model);
    this.llm.temperature = temperature;
  }

  abstract process(input: string, context: AgentContext): Promise<AgentResponse>;

  abstract canHandle(input: string, context: AgentContext): Promise<boolean>;

  protected createSuccessResponse(
    content: string,
    context: AgentContext,
    operation: string,
    executionTime: number,
  ): AgentResponse {
    return {
      success: true,
      content,
      context,
      executionTime,
    };
  }

  protected createErrorResponse(
    error: string,
    context: AgentContext,
    operation: string,
  ): AgentResponse {
    return {
      success: false,
      content: '',
      context,
      error,
    };
  }
}

