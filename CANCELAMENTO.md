# ❌ Cancelamento de Triagem

## Como Funciona

O pai pode **cancelar a triagem a qualquer momento** durante o questionário M-CHAT.

### Palavras que Cancelam

O usuário pode digitar qualquer uma destas frases:

**Mais comuns:**
- "cancelar"
- "parar"
- "não quero mais"
- "desistir"
- "sair"

**Outras variações:**
- "quero parar"
- "quero sair"
- "pare"
- "stop"
- "encerrar"
- "desisto"
- "chega"
- "basta"
- "não continuar"
- "não vou continuar"

### Exemplo de Fluxo

```
📱 Usuário: triagem
🤖 Bot: [Inicia o questionário]

📱 Usuário: sim
🤖 Bot: Pergunta 2/20: ...

📱 Usuário: não quero mais
🤖 Bot:
❌ Triagem Cancelada

Entendo que você preferiu não continuar agora. Tudo bem! 😊

💙 Se mudar de ideia, é só enviar "triagem" novamente
quando se sentir pronto.

Estamos aqui para ajudar, sem pressão.
```

### Depois de Cancelar

- ✅ Sessão é **marcada como "abandoned"** no banco de dados
- ✅ Registrado em qual pergunta o usuário cancelou
- ✅ Respostas já dadas são **mantidas** para análise
- ✅ Usuário pode **iniciar nova triagem** quando quiser

## 📊 Métricas de Cancelamento

### No Supabase

```sql
-- Sessões canceladas
SELECT
  id,
  phone_number,
  current_question,
  started_at,
  last_activity_at
FROM mchat_sessions
WHERE status = 'abandoned'
ORDER BY last_activity_at DESC;

-- Em qual pergunta mais cancelam
SELECT
  current_question,
  COUNT(*) as total_cancelamentos
FROM mchat_sessions
WHERE status = 'abandoned'
GROUP BY current_question
ORDER BY total_cancelamentos DESC;

-- Evento de cancelamento
SELECT
  phone_number,
  event_data->>'cancelled_at_question' as pergunta_cancelada,
  occurred_at
FROM events
WHERE event_type = 'session_cancelled'
ORDER BY occurred_at DESC;
```

### Taxa de Cancelamento

```sql
-- Taxa de cancelamento geral
SELECT
  COUNT(CASE WHEN status = 'abandoned' THEN 1 END) as canceladas,
  COUNT(CASE WHEN status = 'completed' THEN 1 END) as completadas,
  COUNT(*) as total,
  ROUND(
    COUNT(CASE WHEN status = 'abandoned' THEN 1 END)::NUMERIC /
    COUNT(*) * 100,
    2
  ) as taxa_cancelamento
FROM mchat_sessions
WHERE status IN ('abandoned', 'completed');
```

## 🔍 Análise de Abandono

### Perguntas que mais causam cancelamento

Use esta query para identificar perguntas problemáticas:

```sql
-- Top 5 perguntas onde mais cancelam
SELECT
  ms.current_question,
  COUNT(*) as total_cancelamentos,
  -- Texto da pergunta (aproximado pelo ID)
  CASE ms.current_question
    WHEN 1 THEN 'Olha para onde você aponta'
    WHEN 2 THEN 'Já se perguntou se é surdo'
    WHEN 3 THEN 'Brinca de faz de conta'
    -- ... adicione outras
    ELSE 'Pergunta ' || ms.current_question
  END as pergunta
FROM mchat_sessions ms
WHERE ms.status = 'abandoned'
GROUP BY ms.current_question
ORDER BY total_cancelamentos DESC
LIMIT 5;
```

### Tempo até cancelamento

```sql
-- Quanto tempo até cancelar
SELECT
  phone_number,
  current_question,
  EXTRACT(EPOCH FROM (last_activity_at - started_at)) / 60 as minutos_ate_cancelar
FROM mchat_sessions
WHERE status = 'abandoned'
ORDER BY last_activity_at DESC
LIMIT 10;
```

## 🛠️ Para Desenvolvedores

### Adicionar Nova Palavra de Cancelamento

Em `src/whatsapp/whatsapp.service.ts`:

```typescript
private userWantsToCancelMchat(message: string): boolean {
  const normalized = message.toLowerCase().trim();
  const keywords = [
    'cancelar',
    'parar',
    // ... adicione aqui
    'sua_nova_palavra',
  ];

  return keywords.some((keyword) => normalized.includes(keyword));
}
```

### Customizar Mensagem de Cancelamento

Em `src/whatsapp/mchat.service.ts`, método `cancelSession`:

```typescript
return {
  type: 'invalid',
  message: [
    '❌ *Triagem Cancelada*',
    '',
    'Sua mensagem personalizada aqui...',
  ].join('\n'),
};
```

## 💡 Dicas de UX

### Prevenir Cancelamentos Acidentais

Se quiser confirmar antes de cancelar:

```typescript
// Em whatsapp.service.ts
private cancelConfirmations = new Map<string, boolean>();

if (this.userWantsToCancelMchat(trimmedBody)) {
  // Verificar se já confirmou
  if (!this.cancelConfirmations.get(sender)) {
    this.cancelConfirmations.set(sender, true);
    await this.socket?.sendMessage(sender, {
      text: 'Tem certeza que deseja cancelar? Digite "sim, cancelar" para confirmar.',
    });
    return;
  }

  // Confirmado - cancelar de verdade
  this.cancelConfirmations.delete(sender);
  const cancelResponse = await this.mchatService.cancelSession(sender);
  // ...
}
```

### Oferecer Pausa ao Invés de Cancelar

```typescript
// Detectar "depois" ao invés de cancelar
if (normalized.includes('depois') || normalized.includes('mais tarde')) {
  await this.socket?.sendMessage(sender, {
    text: [
      '⏸️ *Pausa na Triagem*',
      '',
      'Você pode continuar de onde parou em até 24 horas.',
      'Basta enviar qualquer mensagem quando quiser retomar!',
    ].join('\n'),
  });
  return;
}
```

## 📈 Benchmarks

| Métrica | Esperado | Bom | Atenção |
|---------|----------|-----|---------|
| Taxa de cancelamento | <20% | <15% | >25% |
| Pergunta média de cancelamento | >10 | >15 | <5 |
| Tempo até cancelar | >5 min | >7 min | <3 min |

### Se Taxa Estiver Alta

**Causas comuns:**
1. Perguntas muito longas ou confusas
2. Muitas perguntas (20 é muito?)
3. Falta de progresso visual ("Pergunta X de 20")
4. Perguntas sensíveis no início
5. Sem explicação de quanto tempo leva

**Soluções:**
1. Simplificar perguntas
2. Adicionar barra de progresso
3. Estimar tempo no início ("leva ~8 minutos")
4. Reordenar perguntas (mais fáceis primeiro)
5. Permitir pausar e retomar

## 🔄 Retomar Após Cancelamento

Atualmente, o usuário precisa **começar do zero** se cancelar.

### TODO: Implementar Retomada

```typescript
// Salvar progresso ao cancelar
async cancelSession(userId: string): Promise<MchatResponse | null> {
  const session = this.sessions.get(userId);

  // Não deletar - apenas marcar como pausada
  if (session.sessionId) {
    await this.analytics.pauseSession(session.sessionId);
  }

  return {
    type: 'invalid',
    message: 'Triagem pausada! Envie "continuar" para retomar.',
  };
}

// Retomar sessão
async resumeSession(userId: string): Promise<MchatResponse> {
  const sessionId = this.sessionIds.get(userId);
  if (sessionId) {
    const savedSession = await this.analytics.getSession(sessionId);
    // Restaurar progresso...
  }
}
```

---

**Status**: ✅ Implementado e funcionando

**Última atualização**: 04/03/2025
