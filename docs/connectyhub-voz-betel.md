# ConnectyHub Voz na Betel

A manutenção, o catálogo de vozes, a clonagem e as respostas de áudio dos agentes usam a API pública ConnectyHub Voz. A Betel não chama o fornecedor de voz diretamente.

## Configuração

Configure no servidor ou em `app_config`:

- `connectyhub_voice_api_key`: chave dedicada `ch_voice_` da Betel; protegida, sem endpoint de revelação.
- `connectyhub_voice_project_id`: projeto de Voz da Betel.
- `connectyhub_voice_billing_organization_id`: organização pagadora da própria Betel.
- `connectyhub_voice_default_model_id`, `connectyhub_voice_default_voice_id` e `connectyhub_voice_agent_voice_id`: seleções opcionais.

As variáveis de ambiente correspondentes usam os mesmos nomes em maiúsculas. Na ausência de identidade específica, o projeto e a organização configurados para IA são candidatos de configuração; a API de Voz deve confirmar ambos antes de qualquer criação. As chaves WhatsApp e IA não são reutilizadas para autenticar Voz. A origem é fixa: `https://www.connectyhub.com.br/api/v1/voice`.

As seleções de voz/modelo legadas são lidas para preservar preferências, mas a credencial ElevenLabs não é lida. Segredos antigos não são apagados ou revogados por esta migração. Uma voz ausente do catálogo do projeto permanece selecionada, com aviso, e não é substituída automaticamente. O vínculo de propriedade do clone deve ser confirmado na ConnectyHub.

## Comportamento e consumo

As regras existentes de consentimento, espelhamento de áudio, resposta em texto, frequência e atrasos permanecem vigentes. O provedor efetivo é ConnectyHub Voz. A síntese preserva as configurações anteriores de estabilidade 0,45, similaridade 0,8, estilo 0,2 e speaker boost ativo.

O catálogo confirma projeto e organização pagadora antes de uma geração. Uma mesma operação usa a mesma credencial durante todas as etapas. Tarifas e disponibilidade vêm do catálogo público, sem preço de fornecedor ou tabela de WhatsApp reaproveitados na Betel.

`voice_operation_receipts` registra o identificador da operação, hash, projeto, organização, modelo, voz, geração e créditos confirmados. Não guarda texto, amostras, áudio ou dados de contato. Somente o servidor tem acesso. Para criação de clone, `voice_id = new-private-clone` identifica a operação inicial; a voz criada é obtida no recibo público vinculado a `generation_id`.

Resultados `reserved`, `processing` ou `uncertain` não são interpretados como sucesso. Após timeout, a consulta reutiliza a operação original; não há nova síntese automática. Um resultado concluído é recuperado por GET, e o download exige autenticação no mesmo projeto. Falha ao baixar áudio não apaga um consumo já confirmado. O recibo financeiro continua preservado em resets de lead, pois não contém histórico nem identificação de contato.

## Painel

- **Prévia incluída** usa o endpoint próprio do clone e exige recibo de zero créditos; consultas seguintes recuperam a mesma prévia.
- **Gerar teste (créditos)** cria um teste avulso. **Consultar teste** recupera a operação iniciada. Uma nova geração exige o botão explícito **Novo teste (usa créditos)**.
- A clonagem aceita de uma a cinco amostras, somando até 3 MB, e exige consentimento. Reenviar a mesma seleção de amostras mantém a operação. Um clone pendente nunca substitui a voz aprovada.
- **Testar conexão** na manutenção consulta os catálogos e não gera áudio.

## Rotas públicas utilizadas

`GET /voices`, `GET /models`, `POST /generations`, `GET /generations/{id}`, `GET /generations/{id}/audio`, `POST /voices` (multipart) e `POST /voices/{id}/preview`. Chamadas de criação enviam `Idempotency-Key`. Áudios não usam URLs públicas ou tokens na query string.

A referência pública está em [documentação ConnectyHub](https://www.connectyhub.com.br/docs/api). A homologação deve confirmar a versão publicada antes da ativação.

## Implantação e validação

Aplicar `20260914193000_connectyhub_voice_receipts.sql` antes do código. Provisionar chave e identidade de Voz da Betel, confirmar o clone no catálogo e executar uma síntese avulsa com identificador fixo. Conferir áudio, recibo e único débito na carteira, sem envio a lead.

`npm run test:connectyhub-voice` cobre autenticação, origem pública, isolamento de credenciais, conflito de conteúdo/conta, prevenção de cobrança com identidade divergente, timeout e replay, prévia incluída, clonagem e proteção de reset. Também executar as regressões de webhook, lifecycle, publicação e reset, além de build e TypeScript.
