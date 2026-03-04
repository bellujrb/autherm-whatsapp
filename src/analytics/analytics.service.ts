import { Injectable, Logger } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

interface VisitorData {
  phoneNumber: string;
}

interface SessionStartData {
  phoneNumber: string;
  visitorId: string;
}

interface SessionProgressData {
  sessionId: string;
  currentQuestion: number;
  questionId: number;
  questionText: string;
  userResponse: 'sim' | 'nao';
  isRisk: boolean;
  timeToAnswerSeconds?: number;
}

interface SessionCompleteData {
  sessionId: string;
  riskScore: number;
  riskLevel: 'baixo' | 'moderado' | 'alto';
  riskItems: string;
}

interface WaitlistData {
  phoneNumber: string;
  visitorId: string;
  sessionId?: string;
  riskScore?: number;
  riskLevel?: string;
}

interface WaitlistResult {
  id: string;
  alreadyExists: boolean;
}

interface EventData {
  phoneNumber: string;
  visitorId?: string;
  sessionId?: string;
  eventType: string;
  eventData?: Record<string, any>;
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);
  private supabase: SupabaseClient | null = null;
  private isEnabled = false;

  constructor() {
    this.initializeSupabase();
  }

  private initializeSupabase(): void {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      this.logger.warn(
        '⚠️  Supabase não configurado. Analytics desabilitado. Configure SUPABASE_URL e SUPABASE_ANON_KEY no .env',
      );
      return;
    }

    try {
      this.supabase = createClient(supabaseUrl, supabaseKey);
      this.isEnabled = true;
      this.logger.log('✅ Analytics habilitado com Supabase');
    } catch (error) {
      this.logger.error('❌ Erro ao inicializar Supabase:', error);
    }
  }

  /**
   * Registra ou atualiza um visitante
   */
  async trackVisitor(data: VisitorData): Promise<string | null> {
    if (!this.isEnabled || !this.supabase) return null;

    try {
      // Busca ou cria visitante
      const { data: existingVisitor, error: fetchError } = await this.supabase
        .from('visitors')
        .select('id')
        .eq('phone_number', data.phoneNumber)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        // PGRST116 = not found
        throw fetchError;
      }

      if (existingVisitor) {
        // Atualiza visitante existente
        const { error: updateError } = await this.supabase
          .from('visitors')
          .update({
            last_seen_at: new Date().toISOString(),
          })
          .eq('id', existingVisitor.id);

        if (updateError) throw updateError;

        // Incrementa o contador de interações separadamente
        const { error: incrementError } = await this.supabase.rpc('increment', {
          row_id: existingVisitor.id,
          column_name: 'total_interactions',
        });

        if (incrementError) {
          this.logger.error('Erro ao incrementar contador:', incrementError);
        }

        this.logger.debug(`👤 Visitante atualizado: ${data.phoneNumber}`);
        return existingVisitor.id;
      } else {
        // Cria novo visitante
        const { data: newVisitor, error: insertError } = await this.supabase
          .from('visitors')
          .insert({
            phone_number: data.phoneNumber,
            total_interactions: 1,
          })
          .select('id')
          .single();

        if (insertError) throw insertError;

        this.logger.log(`✨ Novo visitante registrado: ${data.phoneNumber}`);
        return newVisitor.id;
      }
    } catch (error) {
      this.logger.error('Erro ao rastrear visitante:', error);
      return null;
    }
  }

  /**
   * Inicia uma nova sessão M-CHAT
   */
  async startSession(data: SessionStartData): Promise<string | null> {
    if (!this.isEnabled || !this.supabase) return null;

    try {
      const { data: session, error } = await this.supabase
        .from('mchat_sessions')
        .insert({
          visitor_id: data.visitorId,
          phone_number: data.phoneNumber,
          status: 'started',
          current_question: 0,
          questions_answered: 0,
        })
        .select('id')
        .single();

      if (error) throw error;

      this.logger.log(`📋 Sessão M-CHAT iniciada: ${session.id}`);

      // Registra evento
      await this.trackEvent({
        phoneNumber: data.phoneNumber,
        visitorId: data.visitorId,
        sessionId: session.id,
        eventType: 'session_started',
      });

      return session.id;
    } catch (error) {
      this.logger.error('Erro ao iniciar sessão:', error);
      return null;
    }
  }

  /**
   * Registra progresso da sessão (resposta a uma pergunta)
   */
  async trackSessionProgress(data: SessionProgressData): Promise<void> {
    if (!this.isEnabled || !this.supabase) {
      this.logger.warn('⚠️  Analytics desabilitado - progresso não registrado');
      return;
    }

    try {
      this.logger.debug(`📝 Atualizando sessão ${data.sessionId}...`);

      // Atualiza a sessão
      const { error: updateError } = await this.supabase
        .from('mchat_sessions')
        .update({
          status: 'in_progress',
          current_question: data.currentQuestion,
          questions_answered: data.currentQuestion,
          last_activity_at: new Date().toISOString(),
        })
        .eq('id', data.sessionId);

      if (updateError) {
        this.logger.error('❌ Erro ao atualizar sessão:', {
          code: updateError.code,
          message: updateError.message,
          details: updateError.details,
          hint: updateError.hint,
        });
        throw updateError;
      }

      this.logger.debug(`📝 Inserindo resposta da pergunta ${data.questionId}...`);

      // Insere a resposta
      const { error: answerError } = await this.supabase
        .from('mchat_answers')
        .insert({
          session_id: data.sessionId,
          question_id: data.questionId,
          question_text: data.questionText,
          user_response: data.userResponse,
          is_risk: data.isRisk,
          time_to_answer_seconds: data.timeToAnswerSeconds,
        });

      if (answerError) {
        this.logger.error('❌ Erro ao inserir resposta:', {
          code: answerError.code,
          message: answerError.message,
          details: answerError.details,
          hint: answerError.hint,
          sessionId: data.sessionId,
          questionId: data.questionId,
        });
        throw answerError;
      }

      this.logger.log(
        `✅ Progresso registrado: Sessão ${data.sessionId}, Pergunta ${data.questionId} (${data.userResponse}, Risco: ${data.isRisk})`,
      );
    } catch (error) {
      this.logger.error('Erro ao registrar progresso:', error);
      throw error; // Re-throw para que o caller possa lidar
    }
  }

  /**
   * Completa uma sessão M-CHAT
   */
  async completeSession(data: SessionCompleteData): Promise<void> {
    if (!this.isEnabled || !this.supabase) return;

    try {
      const { error } = await this.supabase
        .from('mchat_sessions')
        .update({
          status: 'completed',
          finished_at: new Date().toISOString(),
          risk_score: data.riskScore,
          risk_level: data.riskLevel,
          risk_items: data.riskItems,
        })
        .eq('id', data.sessionId);

      if (error) throw error;

      this.logger.log(
        `🎯 Sessão completada: ${data.sessionId} - Risco ${data.riskLevel} (${data.riskScore})`,
      );

      // Registra evento
      await this.trackEvent({
        phoneNumber: '', // será obtido do session
        sessionId: data.sessionId,
        eventType: 'session_completed',
        eventData: {
          risk_score: data.riskScore,
          risk_level: data.riskLevel,
        },
      });
    } catch (error) {
      this.logger.error('Erro ao completar sessão:', error);
    }
  }

  /**
   * Cancela uma sessão M-CHAT (marca como abandonada)
   */
  async cancelSession(sessionId: string, currentQuestion: number): Promise<void> {
    if (!this.isEnabled || !this.supabase) return;

    try {
      const { error } = await this.supabase
        .from('mchat_sessions')
        .update({
          status: 'abandoned',
          last_activity_at: new Date().toISOString(),
          current_question: currentQuestion,
        })
        .eq('id', sessionId);

      if (error) throw error;

      this.logger.log(
        `❌ Sessão cancelada: ${sessionId} na pergunta ${currentQuestion}`,
      );

      // Registra evento
      await this.trackEvent({
        phoneNumber: '', // será obtido do session
        sessionId: sessionId,
        eventType: 'session_cancelled',
        eventData: {
          cancelled_at_question: currentQuestion,
          total_questions: 20,
        },
      });
    } catch (error) {
      this.logger.error('Erro ao cancelar sessão:', error);
    }
  }

  /**
   * Adiciona usuário à lista de espera
   */
  async addToWaitlist(data: WaitlistData): Promise<WaitlistResult | null> {
    if (!this.isEnabled || !this.supabase) return null;

    try {
      // Verifica se já existe um registro na lista de espera para este telefone
      const { data: existingEntry, error: fetchError } = await this.supabase
        .from('waitlist')
        .select('id, created_at')
        .eq('phone_number', data.phoneNumber)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        // PGRST116 = not found
        throw fetchError;
      }

      if (existingEntry) {
        this.logger.warn(`⚠️  Usuário já está na lista de espera: ${data.phoneNumber}`);
        return { id: existingEntry.id, alreadyExists: true };
      }

      // Insere novo registro na lista de espera
      const { data: waitlistEntry, error } = await this.supabase
        .from('waitlist')
        .insert({
          visitor_id: data.visitorId,
          session_id: data.sessionId,
          phone_number: data.phoneNumber,
          risk_score: data.riskScore,
          risk_level: data.riskLevel,
          status: 'pending',
        })
        .select('id')
        .single();

      if (error) throw error;

      this.logger.log(`📝 Adicionado à lista de espera: ${data.phoneNumber}`);

      // Registra evento
      await this.trackEvent({
        phoneNumber: data.phoneNumber,
        visitorId: data.visitorId,
        sessionId: data.sessionId,
        eventType: 'waitlist_submitted',
        eventData: {
          risk_score: data.riskScore,
          risk_level: data.riskLevel,
        },
      });

      return { id: waitlistEntry.id, alreadyExists: false };
    } catch (error) {
      this.logger.error('Erro ao adicionar à lista de espera:', error);
      return null;
    }
  }

  /**
   * Registra um evento genérico
   */
  async trackEvent(data: EventData): Promise<void> {
    if (!this.isEnabled || !this.supabase) {
      this.logger.debug(`⚠️  Analytics desabilitado - evento ${data.eventType} não registrado`);
      return;
    }

    try {
      const { error } = await this.supabase.from('events').insert({
        visitor_id: data.visitorId,
        session_id: data.sessionId,
        phone_number: data.phoneNumber,
        event_type: data.eventType,
        event_data: data.eventData,
      });

      if (error) {
        this.logger.error('❌ Erro ao registrar evento:', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
          eventType: data.eventType,
        });
        // Não lança erro - eventos não devem quebrar o fluxo principal
        return;
      }

      this.logger.debug(`📊 Evento registrado: ${data.eventType}`);
    } catch (error) {
      this.logger.error('Erro ao registrar evento:', error);
    }
  }

  /**
   * Marca sessões inativas como abandonadas
   */
  async markAbandonedSessions(): Promise<number> {
    if (!this.isEnabled || !this.supabase) return 0;

    try {
      const { data, error } = await this.supabase.rpc('mark_abandoned_sessions');

      if (error) throw error;

      if (data > 0) {
        this.logger.log(`⏰ ${data} sessões marcadas como abandonadas`);
      }

      return data || 0;
    } catch (error) {
      this.logger.error('Erro ao marcar sessões abandonadas:', error);
      return 0;
    }
  }

  /**
   * Obtém métricas de conversão
   */
  async getConversionMetrics(): Promise<any> {
    if (!this.isEnabled || !this.supabase) return null;

    try {
      const { data, error } = await this.supabase
        .from('metrics_conversion')
        .select('*')
        .single();

      if (error) throw error;

      return data;
    } catch (error) {
      this.logger.error('Erro ao obter métricas de conversão:', error);
      return null;
    }
  }

  /**
   * Obtém métricas de timing
   */
  async getTimingMetrics(): Promise<any> {
    if (!this.isEnabled || !this.supabase) return null;

    try {
      const { data, error } = await this.supabase
        .from('metrics_timing')
        .select('*')
        .single();

      if (error) throw error;

      return data;
    } catch (error) {
      this.logger.error('Erro ao obter métricas de timing:', error);
      return null;
    }
  }

  /**
   * Obtém drop-off por pergunta
   */
  async getDropoffMetrics(): Promise<any[]> {
    if (!this.isEnabled || !this.supabase) return [];

    try {
      const { data, error } = await this.supabase
        .from('metrics_dropoff_by_question')
        .select('*')
        .order('current_question');

      if (error) throw error;

      return data || [];
    } catch (error) {
      this.logger.error('Erro ao obter métricas de drop-off:', error);
      return [];
    }
  }

  /**
   * Obtém distribuição de risco
   */
  async getRiskDistributionMetrics(): Promise<any[]> {
    if (!this.isEnabled || !this.supabase) return [];

    try {
      const { data, error } = await this.supabase
        .from('metrics_risk_distribution')
        .select('*');

      if (error) throw error;

      return data || [];
    } catch (error) {
      this.logger.error('Erro ao obter distribuição de risco:', error);
      return [];
    }
  }
}
