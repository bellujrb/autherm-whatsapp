import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  WASocket,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import * as qrcode from 'qrcode-terminal';

import { MchatService } from './mchat.service';
import { AnalyticsService } from '../analytics/analytics.service';

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

@Injectable()
export class WhatsappService implements OnModuleDestroy {
  private readonly logger = new Logger(WhatsappService.name);
  private socket?: WASocket;
  private readonly conversationHistory = new Map<string, ConversationMessage[]>();
  private readonly interestedNumbers = new Set<string>();
  private readonly visitorIds = new Map<string, string>(); // phoneNumber -> visitorId

  constructor(
    private readonly mchatService: MchatService,
    private readonly analytics: AnalyticsService,
  ) {}

  private addToHistory(userId: string, role: 'user' | 'assistant', content: string): void {
    if (!this.conversationHistory.has(userId)) {
      this.conversationHistory.set(userId, []);
    }

    const history = this.conversationHistory.get(userId)!;
    history.push({ role, content, timestamp: new Date() });

    if (history.length > 20) {
      history.shift();
    }
  }

  private getHistory(userId: string): ConversationMessage[] {
    return this.conversationHistory.get(userId) || [];
  }

  async start(): Promise<void> {
    await this.initializeSocket();
  }

  async onModuleDestroy(): Promise<void> {
    await this.socket?.logout();
    this.socket = undefined;
  }

  private async initializeSocket(): Promise<void> {
    const { state, saveCreds } = await useMultiFileAuthState('auth');
    const { version } = await fetchLatestBaileysVersion();

    this.socket = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: 'info' }),
    });

    this.socket.ev.on('creds.update', saveCreds);
    this.socket.ev.on('connection.update', (update) =>
      this.handleConnectionUpdate(update),
    );
    this.socket.ev.on('messages.upsert', (upsert) =>
      this.handleMessages(upsert).catch((error) =>
        this.logger.error('Erro ao processar mensagem:', error),
      ),
    );
  }

  private handleConnectionUpdate(update: any) {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n📱 Escaneie o QR Code abaixo no WhatsApp:\n');
      qrcode.generate(qr, { small: true });
      this.logger.log('QR Code gerado - Escaneie para conectar');
    }

    if (connection === 'open') {
      this.logger.log('✅ Conexão com WhatsApp estabelecida');
    }

    if (connection === 'close') {
      const shouldReconnect =
        (lastDisconnect?.error as any)?.output?.statusCode !==
        DisconnectReason.loggedOut;

      if (shouldReconnect) {
        this.logger.warn('⚠️  Conexão perdida. Reconectando...');
        setTimeout(() => this.initializeSocket(), 3000);
      } else {
        this.logger.warn(
          '🔴 Conexão encerrada. Apague a pasta "auth" e reinicie.',
        );
      }
    }
  }

  private async handleMessages(upsert: any) {
    const message = upsert.messages?.[0];
    if (!message || message.key.fromMe) return;

    const sender = message.key.remoteJid;
    const messageType = Object.keys(message.message || {})[0];

    if (messageType === 'audioMessage') {
      const response =
        'No momento estamos mantendo a conversa por texto. Para iniciar o Questionário M-CHAT-R/F envie "triagem" ou "questionário".';
      await this.socket?.sendMessage(sender, { text: response });
      this.addToHistory(sender, 'assistant', response);
      return;
    }

    const textBody =
      message.message?.conversation ||
      message.message?.extendedTextMessage?.text ||
      '';

    const trimmedBody = textBody.trim();
    if (!trimmedBody) return;

    this.logger.log(`📩 Mensagem de ${sender}: "${trimmedBody}"`);
    this.addToHistory(sender, 'user', trimmedBody);

    // Rastrear visitante (primeira vez ou retornando)
    let visitorId = this.visitorIds.get(sender);
    if (!visitorId) {
      visitorId = await this.analytics.trackVisitor({ phoneNumber: sender });
      if (visitorId) {
        this.visitorIds.set(sender, visitorId);
      }
    }

    // Mensagem de boas-vindas para primeira interação
    const history = this.getHistory(sender);
    if (history.length === 1) {
      await this.sendWelcomeMessage(sender);
      // Registrar evento de primeira visita
      await this.analytics.trackEvent({
        phoneNumber: sender,
        visitorId,
        eventType: 'first_message',
        eventData: { message: trimmedBody },
      });
      return;
    }

    if (this.userAsksAboutAutherm(trimmedBody)) {
      await this.sendAuthermOverview(sender);
      return;
    }

    if (this.userAsksAboutExam(trimmedBody)) {
      await this.sendExamInfo(sender);
      return;
    }

    // Verificar se o usuário quer entrar na lista de espera
    if (await this.handleExamInterest(sender, trimmedBody)) {
      return;
    }

    const mchatSession = this.mchatService.getSession(sender);
    if (mchatSession) {
      // Verificar se o usuário quer cancelar a triagem
      if (this.userWantsToCancelMchat(trimmedBody)) {
        const cancelResponse = await this.mchatService.cancelSession(sender);
        if (cancelResponse) {
          await this.socket?.sendMessage(sender, { text: cancelResponse.message });
          this.addToHistory(sender, 'assistant', cancelResponse.message);
        }
        return;
      }

      // Processar resposta normal
      const mchatResponse = await this.mchatService.answerQuestion(
        sender,
        trimmedBody,
      );

      await this.socket?.sendMessage(sender, { text: mchatResponse.message });
      this.addToHistory(sender, 'assistant', mchatResponse.message);

      if (mchatResponse.type === 'result') {
        // Sessão completada - tracking já feito no mchat.service
      }

      return;
    }

    // Detecção simples de intenção de iniciar M-CHAT
    if (this.userWantsToStartMchat(trimmedBody)) {
      const startResponse = await this.mchatService.startSession(sender, visitorId);
      await this.socket?.sendMessage(sender, { text: startResponse.message });
      this.addToHistory(sender, 'assistant', startResponse.message);
      return;
    }

    // Mensagem padrão para perguntas não reconhecidas
    const helpMessage = [
      'Desculpe, não entendi sua mensagem. 🤔',
      '',
      '📋 *Posso te ajudar com:*',
      '• Digite *"triagem"* para iniciar o questionário',
      '• Digite *"AUTherm"* para saber mais sobre nossa empresa',
      '• Digite *"exame"* para informações sobre a avaliação fisiológica',
      '• Digite *"lista"* para entrar na lista de espera',
      '',
      'Como posso ajudar?',
    ].join('\n');

    await this.socket?.sendMessage(sender, { text: helpMessage });
    this.addToHistory(sender, 'assistant', helpMessage);
  }

  private async sendWelcomeMessage(sender: string): Promise<void> {
    const text = [
      '👋 Olá! Sou a assistente da *AUTherm*.',
      '',
      '🧩 A AUTherm é uma startup que ajuda famílias a identificarem sinais precoces do autismo de forma acolhedora e baseada em ciência.',
      '',
      '📋 Posso te ajudar com:',
      '1️⃣ *Saber mais sobre a AUTherm* - como funcionamos e o que fazemos',
      '2️⃣ *Fazer a triagem* - questionário rápido para crianças de 16 a 30 meses',
      '',
      '💬 O que você gostaria de fazer? Pode me dizer com suas palavras ou escolher uma das opções acima.',
    ].join('\n');

    await this.socket?.sendMessage(sender, { text });
    this.addToHistory(sender, 'assistant', text);
    this.logger.log(`👋 Mensagem de boas-vindas enviada para ${sender}`);
  }

  private userWantsToStartMchat(message: string): boolean {
    const normalized = message.toLowerCase().trim();

    // Verificar se é exatamente "2" para evitar falsos positivos
    if (normalized === '2') {
      return true;
    }

    const keywords = [
      'triagem',
      'questionário',
      'questionario',
      'm-chat',
      'mchat',
      'm chat',
      'teste',
      'avaliação',
      'avaliacao',
      'rastreamento',
      'fazer triagem',
      'fazer o questionário',
      'iniciar',
      'começar',
      'quero fazer',
      '2️⃣',
      'opção 2',
      'opcao 2',
    ];

    return keywords.some((keyword) => normalized.includes(keyword));
  }

  private userWantsToCancelMchat(message: string): boolean {
    const normalized = message.toLowerCase().trim();
    const keywords = [
      'cancelar',
      'parar',
      'sair',
      'desistir',
      'não quero',
      'nao quero',
      'não quero mais',
      'nao quero mais',
      'quero parar',
      'quero sair',
      'pare',
      'stop',
      'encerrar',
      'desisto',
      'chega',
      'basta',
      'não continuar',
      'nao continuar',
      'não vou continuar',
      'nao vou continuar',
    ];

    return keywords.some((keyword) => normalized.includes(keyword));
  }

  private async handleExamInterest(sender: string, message: string): Promise<boolean> {
    const normalized = message.toLowerCase();
    const phrases = ['lista', 'lista de espera', 'quero lista', 'ativar lista'];
    const matches = phrases.some((phrase) => normalized.includes(phrase));

    if (!matches) {
      return false;
    }

    // Adicionar à waitlist no Supabase (verifica automaticamente se já existe)
    const visitorId = this.visitorIds.get(sender);
    const sessionId = this.mchatService.getSessionId(sender);
    const sessionData = this.mchatService.getLastSessionResult(sender);

    const result = await this.analytics.addToWaitlist({
      phoneNumber: sender,
      visitorId: visitorId || '',
      sessionId: sessionId,
      riskScore: sessionData?.riskScore,
      riskLevel: sessionData?.riskLevel,
    });

    if (!result) {
      // Falha ao adicionar (erro no banco)
      const errorReply = 'Desculpe, tive um problema ao registrar seu interesse. Por favor, tente novamente mais tarde.';
      await this.socket?.sendMessage(sender, { text: errorReply });
      this.addToHistory(sender, 'assistant', errorReply);
      return true;
    }

    // Verificar se já existia ou foi criado agora
    let reply: string;

    if (result.alreadyExists) {
      reply = [
        '📋 *Você já está na lista de espera!*',
        '',
        'Seu interesse já foi registrado anteriormente.',
        '',
        '💙 Nossa equipe entrará em contato quando houver disponibilidade em uma clínica ou hospital parceiro.',
        '',
        'Fique tranquilo, você não perdeu sua posição na fila!',
      ].join('\n');
    } else {
      // Novo registro - adicionar ao Set em memória também
      this.interestedNumbers.add(sender);
      this.logger.log(`👀 Interesse na avaliação fisiológica registrado: ${sender}`);

      reply = [
        '✅ *Lista de espera ativada!*',
        '',
        'Registrei seu interesse na avaliação fisiológica da AUTherm.',
        '',
        '📋 *Próximos passos:*',
        '• Nossa equipe entrará em contato quando houver disponibilidade em uma clínica ou hospital parceiro',
        '• Você receberá informações sobre agendamento e preparação',
        '',
        '💙 Obrigado por confiar na AUTherm. Estamos aqui para apoiar você e sua família!',
      ].join('\n');
    }

    await this.socket?.sendMessage(sender, { text: reply });
    this.addToHistory(sender, 'assistant', reply);
    return true;
  }

  private userAsksAboutAutherm(message: string): boolean {
    const normalized = message.toLowerCase().trim();
    // Verificar se é exatamente "1" para evitar falsos positivos
    if (normalized === '1') {
      return true;
    }
    return normalized.includes('autherm') || normalized.includes('1️⃣') || normalized.includes('opção 1') || normalized.includes('opcao 1') || normalized.includes('saber mais');
  }

  private userAsksAboutExam(message: string): boolean {
    const normalized = message.toLowerCase().trim();
    const keywords = ['exame', 'avaliação fisiológica', 'avaliacao fisiologica', 'exame fisiológico', 'exame fisiologico'];
    return keywords.some((keyword) => normalized.includes(keyword));
  }

  private async sendAuthermOverview(sender: string): Promise<void> {
    const text = [
      '🧩 *Sobre a AUTherm*',
      '',
      'Somos uma startup que apoia famílias na identificação precoce de sinais do autismo, combinando:',
      '',
      '📊 *Triagem comportamental* - Questionário com 20 perguntas sobre o comportamento da criança',
      '🔬 *Avaliação fisiológica* - Análise de sinais do corpo em clínica ou hospital parceiro',
      '',
      '❤️ Nossa missão é ajudar pais a entenderem o desenvolvimento dos seus filhos sem pressão ou pânico.',
      '',
      '🚀 *Próximos passos:*',
      '• Você pode começar fazendo a triagem gratuita aqui no WhatsApp',
      '• Responda "triagem" ou "questionário" para iniciar',
      '',
      'Tem alguma dúvida sobre a AUTherm?',
    ].join('\n');

    await this.socket?.sendMessage(sender, { text });
    this.addToHistory(sender, 'assistant', text);
  }

  private async sendExamInfo(sender: string): Promise<void> {
    const text = [
      '🔍 *Exame AUTherm*',
      '',
      'O exame AUTherm é uma avaliação complementar que ajuda profissionais de saúde a entender melhor o desenvolvimento da criança.',
      '',
      'Ele utiliza uma tecnologia não invasiva que analisa sinais fisiológicos e comportamentais que podem estar relacionados ao desenvolvimento neurológico.',
      '',
      'O exame é realizado em *clínicas e hospitais parceiros* e serve como apoio para médicos e especialistas na investigação de possíveis sinais de autismo.',
      '',
      '💡 *Próximos passos:*',
      '1. *Converse com o pediatra:* leve o resultado da triagem para discutir se uma avaliação mais detalhada é recomendada.',
      '2. *Lista de interesse AUTherm:* se você quiser, posso registrar seu interesse para realizar o exame nas nossas clínicas e hospitais parceiros.',
      '',
      '🔑 Para entrar na lista, basta responder *"lista"*.',
    ].join('\n');

    await this.socket?.sendMessage(sender, { text });
    this.addToHistory(sender, 'assistant', text);
  }
}
