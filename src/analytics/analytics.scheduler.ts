import { Injectable, Logger } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

/**
 * Scheduler para marcar sessões abandonadas automaticamente
 *
 * Para usar:
 * 1. Instale: npm install @nestjs/schedule
 * 2. Adicione ScheduleModule.forRoot() no app.module.ts
 * 3. Descomente o @Injectable() e @Cron()
 * 4. Adicione este scheduler no analytics.module.ts
 *
 * Exemplo de configuração no app.module.ts:
 *
 * import { ScheduleModule } from '@nestjs/schedule';
 *
 * @Module({
 *   imports: [
 *     ScheduleModule.forRoot(),
 *     AnalyticsModule,
 *     // ... outros módulos
 *   ],
 * })
 */

// import { Cron, CronExpression } from '@nestjs/schedule';

// @Injectable()
export class AnalyticsScheduler {
  private readonly logger = new Logger(AnalyticsScheduler.name);

  constructor(private readonly analytics: AnalyticsService) {}

  /**
   * Marca sessões abandonadas a cada hora
   * Cron: '0 * * * *' = A cada hora no minuto 0
   */
  // @Cron('0 * * * *')
  async markAbandonedSessionsHourly() {
    this.logger.log('🕐 Executando job de marcar sessões abandonadas...');

    try {
      const count = await this.analytics.markAbandonedSessions();

      if (count > 0) {
        this.logger.log(`✅ ${count} sessões marcadas como abandonadas`);
      } else {
        this.logger.debug('ℹ️  Nenhuma sessão abandonada encontrada');
      }
    } catch (error) {
      this.logger.error('❌ Erro ao marcar sessões abandonadas:', error);
    }
  }

  /**
   * Gera relatório diário de métricas às 9h
   * Cron: '0 9 * * *' = Todos os dias às 9h
   */
  // @Cron('0 9 * * *')
  async generateDailyReport() {
    this.logger.log('📊 Gerando relatório diário de métricas...');

    try {
      const [conversion, timing, risk] = await Promise.all([
        this.analytics.getConversionMetrics(),
        this.analytics.getTimingMetrics(),
        this.analytics.getRiskDistributionMetrics(),
      ]);

      const report = {
        data: new Date().toISOString().split('T')[0],
        metricas: {
          total_visitantes: conversion?.total_visitors || 0,
          total_sessoes: conversion?.total_sessions_started || 0,
          total_completadas: conversion?.total_sessions_completed || 0,
          taxa_conclusao: `${conversion?.completion_rate || 0}%`,
          tempo_medio: `${timing?.avg_completion_time_minutes || 0} min`,
          lista_espera: conversion?.total_waitlist_submissions || 0,
        },
        distribuicao_risco: risk || [],
      };

      this.logger.log('✅ Relatório diário gerado:');
      this.logger.log(JSON.stringify(report, null, 2));

      // Aqui você pode:
      // - Enviar email com o relatório
      // - Postar em canal do Slack/Discord
      // - Salvar em arquivo
      // - Enviar para webhook

      return report;
    } catch (error) {
      this.logger.error('❌ Erro ao gerar relatório diário:', error);
    }
  }

  /**
   * Exemplo: Limpar dados antigos a cada domingo às 2h da manhã
   * Cron: '0 2 * * 0' = Domingos às 2h
   */
  // @Cron('0 2 * * 0')
  async cleanupOldData() {
    this.logger.log('🧹 Executando limpeza de dados antigos...');

    // Implementar limpeza conforme necessidade
    // Exemplo: deletar eventos com mais de 90 dias

    this.logger.log('✅ Limpeza concluída');
  }
}

// Exemplos de padrões Cron:
//
// A cada segundo:        '* * * * * *'
// A cada 5 segundos:     '*/5 * * * * *'
// A cada minuto:         '0 * * * * *'
// A cada 5 minutos:      '0 */5 * * * *'
// A cada hora:           '0 0 * * * *'
// A cada 6 horas:        '0 0 */6 * * *'
// Todo dia à meia-noite: '0 0 0 * * *'
// Todo dia às 9h:        '0 0 9 * * *'
// Dias úteis às 9h:      '0 0 9 * * 1-5'
// Domingos às 9h:        '0 0 9 * * 0'
// 1º de Janeiro:         '0 0 1 1 * *'
//
// Ou use CronExpression:
// - CronExpression.EVERY_SECOND
// - CronExpression.EVERY_5_SECONDS
// - CronExpression.EVERY_MINUTE
// - CronExpression.EVERY_5_MINUTES
// - CronExpression.EVERY_HOUR
// - CronExpression.EVERY_DAY_AT_MIDNIGHT
// - CronExpression.EVERY_WEEK
