# Arquivo do lead e links nativos Betel

Implementação de 14/09/2026. A Betel é proprietária do cadastro, arquivo, banco, links, visitantes e eventos. ConnectyHub fornece transporte WhatsApp e APIs; nenhuma associação de visitantes ou cópia do dossiê é enviada ao CRM ConnectyHub.

## Comparação inspecionada, somente leitura

| Recurso observado na ConnectyHub | Base já existente na Betel | Implementação própria Betel |
| --- | --- | --- |
| `leads-crm-console.tsx` incorpora `LeadFinancialArchive`; `lead-journey` exibe mensagens e links | `whatsapp_conversation_messages`, `whatsapp_lead_files`, painel CRM | Novos eventos no MESMO `whatsapp_lead_files`, incorporados à linha do tempo do lead |
| `leads-crm.ts` agrega conversas e `intelligence_events` por organização | Conversas por `lead_id` e instância, perfis, agenda e convites | Clique guarda origem, destino, rótulo, posição, rastreio da mensagem e, para publicação, campanha/alvo/parte/imóvel |
| Links de saída, contadores e exclusão de previews | Convite assinado local; URLs de análise antes dependiam do `/w` CH | `/l/UUID` local com registro atômico e idempotente; antigos `/w` continuam resolvendo |
| `tracking/client.ts` usa visitante/sessão e preferências; `/api/track` vincula identidades | Não havia visitante público reutilizável | Cookie próprio aleatório, HttpOnly/Secure/SameSite=Lax, opt-in e prazo; sem IP/fingerprint/GPS |
| Arquivo de mensagens e versões, inclusive intervenção humana | Webhook, mensagens recebidas/enviadas, mídia e histórico próprios | Reutilizados; resposta rápida recebe rótulo legível de botão/opção na timeline, sem duplicar mensagem |

## Cobertura

- Textos, legendas e botões URL enviados pelo cliente ConnectyHub Betel passam pelo adaptador nativo, inclusive as três referências e o botão de leilão. URLs são persistidas antes do transporte; erro de persistência impede envio de conteúdo não rastreado.
- Identificadores de link são estáveis por instância, destinatário, `track_id`, posição e destino. Repetição do envio não cria outro link. Partes aprovadas/snapshots históricos não são alterados.
- Clique em `/l` grava `betel_link_click` no banco Betel. Um UUID identifica o evento e é reutilizado em tentativas de banco. Duas ativações legítimas geram dois UUIDs, mesmo que tenham destino igual.
- A primeira abertura sem preferência apresenta a opção desmarcada de reconhecer visitas e um botão para continuar. O evento de saída é gravado ao continuar; apenas exibir essa página não é contado como abertura do portal. Depois de escolher, navegações seguintes redirecionam normalmente.
- HEAD, previews/bots reconhecidos e prefetch não criam eventos nem cookies. Filtros identificam sinais conhecidos; não comprovam que todo outro acesso seja humano.
- Novos convites usam o mesmo fluxo nativo. Convites assinados antigos continuam válidos, mas seus novos cliques passam ao arquivo com atribuição cautelosa e sem coleta de IP/geolocalização. Abrir convite não confirma ingresso no grupo.
- Respostas rápidas recebidas continuam na mensagem original do webhook; o painel mostra texto e identificador da opção. Não há evento de clique URL fornecido pelo WhatsApp: ele é observado na rota da Betel.
- Com consentimento, home, oportunidades, detalhe, blog e planos registram passagem (`betel_page_view`). Apenas o caminho é salvo, sem parâmetros, formulário ou referrer.
- Agenda, qualificação, mensagens/mídias e convites já instrumentados continuam nos registros próprios, sem criar outro CRM.

## Identidade e destinatário

`intended_lead_id` indica o destinatário original quando existe um cadastro local e o envio é direto. Não confirma quem abriu. `lead_id` do evento identifica apenas um contato confirmado no navegador. Grupos/canais e links encaminhados não criam contatos nem atribuem automaticamente sua identidade ao autor.

Em `/privacidade`, o visitante pode solicitar um código temporário, enviá-lo pessoalmente na conversa direta com a Betel e conferir a chegada. O webhook autenticado, com identidade confiável, registra o contato que enviou o código. Só a confirmação explícita no navegador original associa visitas ainda retidas ao contato. Um código recebido de grupo ou de remetente não confiável não é aceito. Links, número digitado em formulário, IP e UTM não são prova de identidade.

O arquivo do destinatário conserva a referência à mensagem, mas descreve autor anônimo ou outro contato confirmado quando aplicável. Não se transfere nem duplica o cadastro. O painel carrega até 40 eventos recentes por lead (e não os últimos 500 globais), combinados à timeline existente; os demais permanecem no banco até seu prazo.

## Privacidade e retenção

- `BETEL_VISITOR_RETENTION_DAYS`: padrão 30, limite 1–90 dias. Cookie guarda token aleatório; banco guarda seu hash.
- `BETEL_JOURNEY_RETENTION_DAYS`: padrão 90, limite 1–365 dias para os novos eventos de cliques/páginas.
- Código de associação vence em 15 minutos. GPC/DNT e recusa de reconhecimento são respeitados; ainda é possível abrir links sem um visitante persistente.
- Desativar remove a associação do navegador e bloqueia novos reconhecimentos. Não apaga automaticamente mensagens comerciais anteriores.
- `prune_betel_journey` remove eventos expirados, códigos e visitantes. Integra a rotina Inngest de limpeza já existente, a cada 30 minutos. Consultas excluem eventos expirados mesmo se o agendador estiver indisponível. Links permanecem resolvíveis.
- Nenhum pixel de terceiro, conteúdo de formulário, IP, geolocalização ou impressão digital é coletado pelo novo fluxo.

## Validação e limites

Testes controlados sem rede: texto/menu/legenda, estabilidade de links, consentimento desmarcado, cookie, CSRF, HEAD/preview, dois cliques distintos, retry idempotente, visitante anônimo, destinatário diferente do ator, confirmação em duas etapas, retenção, isolamento de privilégios e projeção no arquivo/timeline. PostgreSQL real em memória via PGlite executa a migração e as rotinas.

A migração foi aplicada ao banco Betel em 14/09/2026 às 20:30:26 UTC. Leitura posterior confirmou função disponível e zero links/visitantes criados por teste. Não foram enviados WhatsApps, feitas aprovações, cobradas operações nem clicados links de campanhas reais nesta validação. A chegada real de webhook + navegador confirmado não foi simulada em produção.

Limites: não reconhece outro dispositivo/cookies removidos; não observa o que acontece em portais externos após a saída; não comprova ingresso em grupo; formulário não verificado não identifica pessoa. Mensagens enviadas fora das integrações Betel e URLs de campanhas de outras plataformas não passam automaticamente por esse adaptador. A modalidade CH somente transporte requer a configuração da organização acordada com sua responsável; preservar URLs, omitir CRM na saída e no webhook de retorno são partes dessa configuração.
