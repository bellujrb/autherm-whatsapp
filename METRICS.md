# 📊 Sistema de Métricas - AUTherm WhatsApp Bot

Este documento descreve como o sistema de métricas funciona e como acessar os dados.

## 🎯 Métricas Implementadas

### 1. Total que iniciam
**Métrica**: `session_started`

Rastreado automaticamente quando o usuário:
- Responde "triagem", "questionário" ou palavras-chave relacionadas
- Inicia o M-CHAT através do menu

```typescript
// Chamado automaticamente no whatsapp.service.ts
const startResponse = await this.mchatService.startSession(sender, visitorId);
```

### 2. Visitante → Início
**Métrica**: `session_started / visitor_seen`

Taxa de conversão de visitantes em iniciantes do M-CHAT.

**Como obter**:
```typescript
const metrics = await this.analytics.getConversionMetrics();
console.log(metrics.visitor_to_session_rate); // Ex: 45.50%
```

**SQL Direto**:
```sql
SELECT visitor_to_session_rate
FROM metrics_conversion;
```

### 3. Conclusão
**Métrica**: `session_completed / session_started`

Taxa de conclusão do questionário.

**Como obter**:
```typescript
const metrics = await this.analytics.getConversionMetrics();
console.log(metrics.completion_rate); // Ex: 78.30%
```

### 4. Tempo Médio
**Métrica**: Média de `(finished_at - started_at)` nas sessões concluídas

**Como obter**:
```typescript
const timing = await this.analytics.getTimingMetrics();
console.log(timing.avg_completion_time_minutes); // Ex: 8.5 minutos
```

### 5. Abandono
**Métrica**: `abandoned_24h / session_started` + drop-off por pergunta

**Como obter abandonos em 24h**:
```sql
SELECT * FROM metrics_abandoned_24h;
```

**Como obter drop-off por pergunta**:
```typescript
const dropoff = await this.analytics.getDropoffMetrics();

dropoff.forEach(q => {
  console.log(`Pergunta ${q.current_question}:`);
  console.log(`  Chegaram: ${q.sessions_reached}`);
  console.log(`  Abandonaram: ${q.sessions_abandoned}`);
  console.log(`  Taxa: ${q.abandonment_rate}%`);
});
```

### 6. Compreensão Clara
**Métrica**: `clarity_yes / session_completed`

> ⚠️ **TODO**: Ainda não implementado. Requer adicionar pergunta pós-triagem:
> "Você entendeu o resultado da triagem?"

**Implementação futura**:
```typescript
// Após enviar resultado
if (riskScore >= 3) {
  // Perguntar se entendeu
  // Rastrear resposta em mchat_sessions.clarity_response
}
```

### 7. Intenção Avaliação
**Métricas**:
- `waitlist_yes / session_completed`: Taxa de interesse
- `waitlist_submitted`: Conversão real para lista de espera

**Como obter**:
```typescript
const metrics = await this.analytics.getConversionMetrics();
console.log(metrics.waitlist_conversion_rate); // Ex: 35.20%
```

**SQL para total de submissões**:
```sql
SELECT COUNT(*) as total_waitlist
FROM waitlist
WHERE status = 'pending';
```

## 📈 Dashboard de Métricas

### Funil de Conversão

```
Visitantes (100%)
    ↓
Iniciaram M-CHAT (visitor_to_session_rate%)
    ↓
Completaram (completion_rate%)
    ↓
Lista de Espera (waitlist_conversion_rate%)
```

### Exemplo de Query Completa

```sql
WITH funil AS (
  SELECT
    COUNT(DISTINCT v.id) as visitantes,
    COUNT(DISTINCT ms.id) as iniciaram,
    COUNT(DISTINCT CASE WHEN ms.status = 'completed' THEN ms.id END) as completaram,
    COUNT(DISTINCT w.id) as lista_espera
  FROM visitors v
  LEFT JOIN mchat_sessions ms ON v.id = ms.visitor_id
  LEFT JOIN waitlist w ON ms.id = w.session_id
)
SELECT
  visitantes,
  iniciaram,
  ROUND(iniciaram::NUMERIC / visitantes * 100, 2) as taxa_inicio,
  completaram,
  ROUND(completaram::NUMERIC / iniciaram * 100, 2) as taxa_conclusao,
  lista_espera,
  ROUND(lista_espera::NUMERIC / completaram * 100, 2) as taxa_waitlist
FROM funil;
```

## 🔍 Acessando Métricas via Código

### No NestJS

```typescript
import { AnalyticsService } from './analytics/analytics.service';

@Injectable()
export class MetricsController {
  constructor(private readonly analytics: AnalyticsService) {}

  async getDashboard() {
    const [conversion, timing, dropoff, risk] = await Promise.all([
      this.analytics.getConversionMetrics(),
      this.analytics.getTimingMetrics(),
      this.analytics.getDropoffMetrics(),
      this.analytics.getRiskDistributionMetrics(),
    ]);

    return {
      funil: {
        visitantes: conversion.total_visitors,
        sessoes_iniciadas: conversion.total_sessions_started,
        sessoes_completadas: conversion.total_sessions_completed,
        lista_espera: conversion.total_waitlist_submissions,
      },
      taxas: {
        visitante_para_inicio: `${conversion.visitor_to_session_rate}%`,
        conclusao: `${conversion.completion_rate}%`,
        conversao_waitlist: `${conversion.waitlist_conversion_rate}%`,
      },
      tempo_medio: {
        minutos: timing.avg_completion_time_minutes,
      },
      abandono_por_pergunta: dropoff,
      distribuicao_risco: risk,
    };
  }
}
```

### Marcar Sessões Abandonadas

Execute periodicamente (recomendado: a cada hora):

```typescript
// Em um serviço de cron/scheduler
async markAbandonedSessions() {
  const count = await this.analytics.markAbandonedSessions();
  console.log(`${count} sessões marcadas como abandonadas`);
}
```

## 📊 Eventos Customizados

Você pode rastrear eventos customizados:

```typescript
await this.analytics.trackEvent({
  phoneNumber: sender,
  visitorId: visitorId,
  sessionId: sessionId,
  eventType: 'custom_event_name',
  eventData: {
    key1: 'value1',
    key2: 123,
  },
});
```

**Exemplos de eventos**:
- `first_message`: Primeira mensagem do usuário
- `session_started`: Início do M-CHAT
- `session_completed`: Conclusão do M-CHAT
- `waitlist_submitted`: Entrada na lista de espera
- `about_autherm_clicked`: Usuário pediu info sobre AUTherm
- `exam_info_requested`: Usuário pediu info sobre exame

## 🎨 Visualizações Recomendadas

### 1. Gráfico de Funil
```
Visitantes:        1000 (100%)
   ↓ -55%
Iniciaram:          450 (45%)
   ↓ -22%
Completaram:        350 (78% de 450)
   ↓ -65%
Lista Espera:       123 (35% de 350)
```

### 2. Drop-off por Pergunta (Linha)
```
100% ─────────────────────
 90% ────────────
 80% ──────────────
 70% ────────────────
      1  5  10  15  20
        Pergunta
```

### 3. Distribuição de Risco (Pizza)
```
Baixo:    60% (210 sessões)
Moderado: 30% (105 sessões)
Alto:     10% (35 sessões)
```

### 4. Tendência no Tempo (Linha)
```
Conclusões por dia:
  01/03: 15
  02/03: 23
  03/03: 31
  04/03: 28
```

## 🔧 Troubleshooting

### Analytics não está funcionando

Verifique:
1. **Variáveis de ambiente configuradas**:
   ```bash
   echo $SUPABASE_URL
   echo $SUPABASE_ANON_KEY
   ```

2. **Logs do bot**:
   - ✅ Deve aparecer: "Analytics habilitado com Supabase"
   - ⚠️ Se aparecer: "Supabase não configurado"

3. **Teste manual no Supabase**:
   ```sql
   SELECT COUNT(*) FROM visitors;
   ```

### Dados não aparecem

1. Verifique se as tabelas existem:
   ```sql
   SELECT table_name
   FROM information_schema.tables
   WHERE table_schema = 'public';
   ```

2. Verifique logs de erro no Supabase:
   - Vá em **Logs** → **Database**

3. Teste inserção manual:
   ```sql
   INSERT INTO visitors (phone_number) VALUES ('5511999999999');
   ```

## 📊 Métricas de Sucesso

Benchmarks recomendados:

| Métrica | Esperado | Bom | Excelente |
|---------|----------|-----|-----------|
| Visitante → Início | 30% | 40% | 50%+ |
| Taxa de Conclusão | 60% | 70% | 80%+ |
| Tempo Médio | <15 min | <10 min | <7 min |
| Abandono 24h | <30% | <20% | <15% |
| Conversão Waitlist (risco moderado/alto) | 20% | 30% | 40%+ |

## 🚀 Próximas Melhorias

1. ✅ **Implementado**: Tracking básico de métricas
2. ⏳ **TODO**: Pergunta de compreensão pós-resultado
3. ⏳ **TODO**: Dashboard visual (Grafana/Metabase)
4. ⏳ **TODO**: Alertas automáticos (ex: taxa de abandono > 40%)
5. ⏳ **TODO**: Cohort analysis (comportamento por semana/mês)
6. ⏳ **TODO**: A/B testing framework
7. ⏳ **TODO**: Análise de sentimento nas respostas livres

## 📞 Consultas Úteis

### Top 5 perguntas com maior taxa de abandono
```sql
SELECT *
FROM metrics_dropoff_by_question
ORDER BY abandonment_rate DESC
LIMIT 5;
```

### Usuários que abandonaram na última pergunta
```sql
SELECT phone_number, current_question, last_activity_at
FROM mchat_sessions
WHERE status = 'abandoned'
AND current_question >= 18
ORDER BY last_activity_at DESC;
```

### Taxa de conversão por nível de risco
```sql
SELECT
  risk_level,
  total_sessions,
  waitlist_submissions,
  waitlist_rate
FROM metrics_risk_distribution
ORDER BY waitlist_rate DESC;
```

### Horário de pico de uso
```sql
SELECT
  EXTRACT(HOUR FROM started_at) as hora,
  COUNT(*) as total_sessoes
FROM mchat_sessions
WHERE started_at >= NOW() - INTERVAL '7 days'
GROUP BY hora
ORDER BY total_sessoes DESC;
```
