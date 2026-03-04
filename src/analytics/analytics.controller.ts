import { Controller, Get } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

/**
 * Controller para expor métricas via API REST
 *
 * Para usar:
 * 1. Descomente o @Controller no início desta classe
 * 2. Adicione este controller no analytics.module.ts
 * 3. Acesse http://localhost:3000/analytics/dashboard
 *
 * IMPORTANTE: Em produção, adicione autenticação!
 */

// @Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  /**
   * GET /analytics/dashboard
   * Retorna um resumo completo das métricas
   */
  @Get('dashboard')
  async getDashboard() {
    const [conversion, timing, dropoff, risk] = await Promise.all([
      this.analytics.getConversionMetrics(),
      this.analytics.getTimingMetrics(),
      this.analytics.getDropoffMetrics(),
      this.analytics.getRiskDistributionMetrics(),
    ]);

    return {
      timestamp: new Date().toISOString(),
      funil: {
        total_visitantes: conversion?.total_visitors || 0,
        total_sessoes_iniciadas: conversion?.total_sessions_started || 0,
        total_sessoes_completadas: conversion?.total_sessions_completed || 0,
        total_lista_espera: conversion?.total_waitlist_submissions || 0,
      },
      taxas_conversao: {
        visitante_para_inicio: `${conversion?.visitor_to_session_rate || 0}%`,
        taxa_conclusao: `${conversion?.completion_rate || 0}%`,
        taxa_conversao_waitlist: `${conversion?.waitlist_conversion_rate || 0}%`,
      },
      tempo: {
        tempo_medio_minutos: timing?.avg_completion_time_minutes || 0,
        tempo_minimo_minutos: timing?.min_completion_time_minutes || 0,
        tempo_maximo_minutos: timing?.max_completion_time_minutes || 0,
      },
      abandono_por_pergunta: dropoff || [],
      distribuicao_risco: risk || [],
    };
  }

  /**
   * GET /analytics/conversion
   * Retorna métricas de conversão
   */
  @Get('conversion')
  async getConversion() {
    const metrics = await this.analytics.getConversionMetrics();
    return metrics || {
      total_visitors: 0,
      total_sessions_started: 0,
      total_sessions_completed: 0,
      total_waitlist_submissions: 0,
      visitor_to_session_rate: 0,
      completion_rate: 0,
      waitlist_conversion_rate: 0,
    };
  }

  /**
   * GET /analytics/timing
   * Retorna métricas de tempo
   */
  @Get('timing')
  async getTiming() {
    const metrics = await this.analytics.getTimingMetrics();
    return metrics || {
      total_completed_sessions: 0,
      avg_completion_time_minutes: 0,
      min_completion_time_minutes: 0,
      max_completion_time_minutes: 0,
    };
  }

  /**
   * GET /analytics/dropoff
   * Retorna taxa de abandono por pergunta
   */
  @Get('dropoff')
  async getDropoff() {
    const metrics = await this.analytics.getDropoffMetrics();
    return metrics || [];
  }

  /**
   * GET /analytics/risk-distribution
   * Retorna distribuição de risco
   */
  @Get('risk-distribution')
  async getRiskDistribution() {
    const metrics = await this.analytics.getRiskDistributionMetrics();
    return metrics || [];
  }

  /**
   * POST /analytics/mark-abandoned
   * Marca sessões inativas como abandonadas
   */
  @Get('mark-abandoned')
  async markAbandoned() {
    const count = await this.analytics.markAbandonedSessions();
    return {
      success: true,
      sessoes_marcadas: count,
      message: `${count} sessões marcadas como abandonadas`,
    };
  }

  /**
   * GET /analytics/health
   * Verifica se o analytics está funcionando
   */
  @Get('health')
  async health() {
    // Tenta buscar métricas básicas
    try {
      const conversion = await this.analytics.getConversionMetrics();
      return {
        status: 'ok',
        analytics_enabled: !!conversion,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'error',
        analytics_enabled: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }
}
