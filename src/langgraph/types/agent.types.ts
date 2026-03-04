export interface AgentContext {
  chatId?: string;
  userId: string;
  conversationHistory?: Array<{ role: string; content: string }>;
  metadata?: Record<string, any>;
}

export interface AgentResponse {
  success: boolean;
  content: string;
  context: AgentContext;
  error?: string;
  executionTime?: number;
}
