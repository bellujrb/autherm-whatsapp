import { Injectable, Logger } from '@nestjs/common';
import { AnalyticsService } from '../analytics/analytics.service';

type RiskAnswer = 'sim' | 'nao';

interface MchatQuestion {
  id: number;
  text: string;
  riskAnswer: RiskAnswer;
}

interface MchatAnswer {
  questionId: number;
  questionText: string;
  response: RiskAnswer;
  isRisk: boolean;
}

interface MchatSession {
  currentIndex: number;
  answers: MchatAnswer[];
  startedAt: Date;
  sessionId?: string; // ID da sessão no Supabase
  lastQuestionTime?: Date; // Para calcular tempo entre perguntas
}

interface SessionResult {
  riskScore: number;
  riskLevel: string;
}

export type MchatResponse =
  | { type: 'question'; message: string }
  | {
      type: 'result';
      message: string;
      riskScore: number;
      riskItems: string;
      riskLevel: string;
    }
  | { type: 'invalid'; message: string };

const MCHAT_QUESTIONS: MchatQuestion[] = [
  {
    id: 1,
    text: 'Se você apontar para qualquer coisa do outro lado do cômodo, sua criança olha para o que você está apontando?',
    riskAnswer: 'nao',
  },
  {
    id: 2,
    text: 'Alguma vez você já se perguntou se sua criança poderia ser surda?',
    riskAnswer: 'sim',
  },
  {
    id: 3,
    text: 'Sua criança brinca de faz de conta (por exemplo, finge que está bebendo em um copo vazio ou falando ao telefone)?',
    riskAnswer: 'nao',
  },
  {
    id: 4,
    text: 'Sua criança gosta de subir nas coisas (móveis, brinquedos do parque ou escadas)?',
    riskAnswer: 'nao',
  },
  {
    id: 5,
    text: 'Sua criança faz movimentos incomuns com os dedos perto dos olhos, como abanar os dedos na frente do rosto?',
    riskAnswer: 'sim',
  },
  {
    id: 6,
    text: 'Sua criança aponta com o dedo para pedir algo ou para conseguir ajuda?',
    riskAnswer: 'nao',
  },
  {
    id: 7,
    text: 'Sua criança aponta com o dedo para lhe mostrar algo interessante?',
    riskAnswer: 'nao',
  },
  {
    id: 8,
    text: 'Sua criança se interessa por outras crianças (observa, sorri, aproxima-se)?',
    riskAnswer: 'nao',
  },
  {
    id: 9,
    text: 'Sua criança mostra coisas para você, trazendo-as ou segurando-as para que você as veja só para compartilhar?',
    riskAnswer: 'nao',
  },
  {
    id: 10,
    text: 'Sua criança responde quando você a chama pelo nome (olha, para o que fazia ou balbucia)?',
    riskAnswer: 'nao',
  },
  {
    id: 11,
    text: 'Quando você sorri para sua criança, ela sorri de volta?',
    riskAnswer: 'nao',
  },
  {
    id: 12,
    text: 'Sua criança fica incomodada com os ruídos do dia a dia (aspirador, música alta, trânsito)?',
    riskAnswer: 'sim',
  },
  {
    id: 13,
    text: 'Sua criança já anda?',
    riskAnswer: 'nao',
  },
  {
    id: 14,
    text: 'Sua criança olha você nos olhos quando você fala com ela, brinca com ela ou veste-a?',
    riskAnswer: 'nao',
  },
  {
    id: 15,
    text: 'Sua criança tenta imitar aquilo que você faz (mostrar a língua, fazer sons, dar tchau)?',
    riskAnswer: 'nao',
  },
  {
    id: 16,
    text: 'Se você virar a cabeça para olhar alguma coisa, sua criança olha em volta para ver o que é?',
    riskAnswer: 'nao',
  },
  {
    id: 17,
    text: 'Sua criança busca que você preste atenção nela (olha para você pedindo elogio ou dizendo “olha”)?',
    riskAnswer: 'nao',
  },
  {
    id: 18,
    text: 'Sua criança compreende quando você diz para ela fazer alguma coisa simples (sem dar pistas não verbais)?',
    riskAnswer: 'nao',
  },
  {
    id: 19,
    text: 'Quando acontece algo novo, sua criança olha para o seu rosto para ver sua reação?',
    riskAnswer: 'nao',
  },
  {
    id: 20,
    text: 'Sua criança gosta de atividades com movimento (ser balançada, pular nos seus joelhos)?',
    riskAnswer: 'nao',
  },
];

@Injectable()
export class MchatService {
  private readonly logger = new Logger(MchatService.name);
  private readonly sessions = new Map<string, MchatSession>();
  private readonly sessionResults = new Map<string, SessionResult>(); // Armazena resultados para waitlist
  private readonly sessionIds = new Map<string, string>(); // userId -> sessionId do Supabase

  constructor(private readonly analytics: AnalyticsService) {}

  async startSession(userId: string, visitorId?: string): Promise<MchatResponse> {
    this.logger.log(`Iniciando novo questionário M-CHAT para ${userId}`);

    // Criar sessão no Supabase
    const sessionId = await this.analytics.startSession({
      phoneNumber: userId,
      visitorId: visitorId || '',
    });

    const session: MchatSession = {
      currentIndex: 0,
      answers: [],
      startedAt: new Date(),
      sessionId: sessionId || undefined,
      lastQuestionTime: new Date(),
    };

    this.sessions.set(userId, session);
    if (sessionId) {
      this.sessionIds.set(userId, sessionId);
    }

    return {
      type: 'question',
      message: `${this.buildIntroduction()}\n\n${this.buildQuestionPrompt(
        MCHAT_QUESTIONS[0],
        0,
      )}`,
    };
  }

  getSession(userId: string): MchatSession | undefined {
    return this.sessions.get(userId);
  }

  getSessionId(userId: string): string | undefined {
    return this.sessionIds.get(userId);
  }

  getLastSessionResult(userId: string): SessionResult | undefined {
    return this.sessionResults.get(userId);
  }

  /**
   * Cancela uma sessão em andamento
   */
  async cancelSession(userId: string): Promise<MchatResponse | null> {
    const session = this.sessions.get(userId);

    if (!session) {
      return null; // Não há sessão para cancelar
    }

    this.logger.log(`❌ Cancelando sessão M-CHAT para ${userId}`);

    // Marcar como abandonada no Supabase
    if (session.sessionId) {
      try {
        await this.analytics.cancelSession(session.sessionId, session.currentIndex);
        this.logger.log(`✅ Sessão ${session.sessionId} marcada como cancelada`);
      } catch (error) {
        this.logger.error('Erro ao marcar sessão como cancelada:', error);
      }
    }

    // Remover sessão local
    this.sessions.delete(userId);
    this.sessionIds.delete(userId);

    return {
      type: 'invalid',
      message: [
        '❌ *Triagem Cancelada*',
        '',
        'Entendo que você preferiu não continuar agora. Tudo bem! 😊',
        '',
        '💙 Se mudar de ideia, é só enviar *"triagem"* novamente quando se sentir pronto.',
        '',
        'Estamos aqui para ajudar, sem pressão.',
      ].join('\n'),
    };
  }

  async answerQuestion(userId: string, rawAnswer: string): Promise<MchatResponse> {
    const session = this.sessions.get(userId);

    if (!session) {
      return {
        type: 'invalid',
        message: 'Ainda não iniciamos o questionário. Envie "triagem" ou "questionário" para começar.',
      };
    }

    const normalized = this.normalizeAnswer(rawAnswer);

    if (!normalized) {
      return {
        type: 'invalid',
        message:
          'Por favor, responda com *Sim* ou *Não* 😊\n\nPense no que seu filho(a) costuma fazer no dia a dia. Se algo acontece raramente, considere como *Não*.',
      };
    }

    const question = MCHAT_QUESTIONS[session.currentIndex];
    const isRisk = normalized === question.riskAnswer;

    // Calcular tempo para responder
    const now = new Date();
    const timeToAnswer = session.lastQuestionTime
      ? Math.floor((now.getTime() - session.lastQuestionTime.getTime()) / 1000)
      : undefined;

    session.answers.push({
      questionId: question.id,
      questionText: question.text,
      response: normalized,
      isRisk,
    });

    session.currentIndex += 1;
    session.lastQuestionTime = now;

    // Rastrear progresso no Supabase
    if (session.sessionId) {
      this.logger.debug(
        `📊 Registrando resposta - Sessão: ${session.sessionId}, Pergunta: ${question.id}, Resposta: ${normalized}, Risco: ${isRisk}`,
      );

      try {
        await this.analytics.trackSessionProgress({
          sessionId: session.sessionId,
          currentQuestion: session.currentIndex,
          questionId: question.id,
          questionText: question.text,
          userResponse: normalized,
          isRisk,
          timeToAnswerSeconds: timeToAnswer,
        });

        this.logger.debug(`✅ Resposta registrada com sucesso`);
      } catch (error) {
        this.logger.error(`❌ Erro ao registrar resposta:`, error);
      }
    } else {
      this.logger.warn(`⚠️  Sessão sem ID do Supabase - resposta não será registrada`);
    }

    if (session.currentIndex >= MCHAT_QUESTIONS.length) {
      const resultPayload = await this.buildResultMessage(session, userId);
      this.sessions.delete(userId);
      return {
        type: 'result',
        message: resultPayload.message,
        riskScore: resultPayload.riskScore,
        riskItems: resultPayload.riskItems,
        riskLevel: resultPayload.riskLevel,
      };
    }

    const nextQuestion = MCHAT_QUESTIONS[session.currentIndex];
    return {
      type: 'question',
      message: this.buildQuestionPrompt(nextQuestion, session.currentIndex),
    };
  }

  private normalizeAnswer(input: string): RiskAnswer | null {
    const cleaned = input.trim().toLowerCase();
    const positives = ['sim', 's', 'yes', 'y'];
    const negatives = ['nao', 'não', 'n', 'no'];

    if (positives.includes(cleaned)) {
      return 'sim';
    }

    if (negatives.includes(cleaned)) {
      return 'nao';
    }

    return null;
  }

  private buildIntroduction(): string {
    return [
      '📋 *Vamos começar a triagem!*',
      '',
      'Vou fazer 20 perguntas sobre o comportamento do seu filho(a). São perguntas simples do dia a dia.',
      '',
      '✅ Responda com *Sim* ou *Não* pensando no que seu filho(a) costuma fazer normalmente.',
      '💡 Se algo acontece raramente, considere como *Não*.',
      '',
      'Fique tranquilo(a), não existem respostas certas ou erradas. Vamos juntos!',
    ].join('\n');
  }

  private buildQuestionPrompt(question: MchatQuestion, index: number): string {
    return [
      `📌 *Pergunta ${index + 1} de ${MCHAT_QUESTIONS.length}*`,
      '',
      question.text,
      '',
      '💬 Responda *Sim* ou *Não*',
    ].join('\n');
  }

  private async buildResultMessage(
    session: MchatSession,
    userId: string,
  ): Promise<{
    message: string;
    riskScore: number;
    riskItems: string;
    riskLevel: string;
  }> {
    const riskAnswers = session.answers.filter((answer) => answer.isRisk);
    const riskScore = riskAnswers.length;
    const riskLevel = this.getRiskLevel(riskScore);
    const riskItems =
      riskAnswers.length > 0
        ? riskAnswers.map((answer) => `${answer.questionId}`).join(', ')
        : 'nenhum';

    const nextSteps = this.buildNextSteps(riskScore);
    const waitingListNotice =
      riskScore >= 3
        ? '\n\n💙 *Quer saber mais sobre o exame da AUTherm?*\nResponda "exame" que eu te explico como funciona.'
        : '';

    const message = [
      '📊 *Triagem M-CHAT-R/F Concluída!*',
      '',
      `Pontuação: ${riskScore} de ${MCHAT_QUESTIONS.length} sinais identificados`,
      `Questões com sinais: ${riskItems}`,
      '',
      nextSteps,
      waitingListNotice,
    ].join('\n');

    // Armazenar resultado para lista de espera
    this.sessionResults.set(userId, {
      riskScore,
      riskLevel: riskLevel.label.toLowerCase(),
    });

    // Completar sessão no Supabase
    if (session.sessionId) {
      await this.analytics.completeSession({
        sessionId: session.sessionId,
        riskScore,
        riskLevel: riskLevel.label.toLowerCase() as 'baixo' | 'moderado' | 'alto',
        riskItems,
      });
    }

    return {
      message,
      riskScore,
      riskItems,
      riskLevel: riskLevel.label,
    };
  }

  private buildNextSteps(riskScore: number): string {
    if (riskScore <= 2) {
      return [
        '✅ *Resultado: Baixo risco*',
        '',
        'Continue acompanhando o desenvolvimento do seu filho(a) normalmente.',
        '• Se ele(a) tem menos de 24 meses, você pode repetir esta triagem mais pra frente',
        '• Se surgirem novas preocupações, converse com o pediatra',
      ].join('\n');
    }

    if (riskScore <= 7) {
      return [
        '⚠️ *Resultado: Risco moderado*',
        '',
        'Alguns sinais apareceram na triagem que merecem uma avaliação mais detalhada.',
        '',
        '*O que fazer agora:*',
        '1. Converse com o pediatra do seu filho(a)',
        '2. Considere fazer a avaliação fisiológica da AUTherm em uma clínica ou hospital parceiro',
        '',
        'Lembre-se: esta triagem não é um diagnóstico! É apenas um primeiro passo para entender melhor o desenvolvimento.',
      ].join('\n');
    }

    return [
      '🔴 *Resultado: Alto risco*',
      '',
      'Vários sinais importantes apareceram na triagem.',
      '',
      '*O que fazer agora:*',
      '1. Agende uma consulta com o pediatra o quanto antes',
      '2. Mencione que fez a triagem M-CHAT e o resultado',
      '3. Considere fazer a avaliação fisiológica da AUTherm',
      '',
      'Respire fundo: quanto mais cedo identificamos sinais, mais cedo podemos ajudar. Você está no caminho certo ao buscar informações.',
    ].join('\n');
  }

  private getRiskLevel(score: number): { label: string; emoji: string } {
    if (score >= 8) {
      return { label: 'Alto risco', emoji: '🔴' };
    }
    if (score >= 3) {
      return { label: 'Risco moderado', emoji: '🟡' };
    }

    return { label: 'Baixo risco', emoji: '🟢' };
  }
}
