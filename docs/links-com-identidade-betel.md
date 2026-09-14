# Links com identidade Betel

Os novos links de WhatsApp devem ser produzidos pela ConnectyHub com a origem autorizada da organização Betel e o caminho `/w/{UUID}`. A origem atual é `https://betel-leil-es.vercel.app`. A ConnectyHub não deve aceitar uma origem arbitrária enviada no corpo da mensagem: o vínculo é configuração administrativa por organização.

A rota pública Betel resolve somente o UUID pela API autenticada da ConnectyHub, que confere a propriedade do link pela organização da chave WhatsApp. O navegador recebe um redirecionamento local ao destino já registrado. Nenhuma credencial vai para o navegador ou para o site do anúncio. Parâmetros de destino na URL não são usados, e não há redirecionamento para hosts de infraestrutura, credenciais embutidas ou ciclos de `/w/`.

## Contrato e configuração

- `GET https://www.connectyhub.com.br/api/v1/links/{UUID}/resolve`: autenticação pela chave WhatsApp existente, escopo `instances:read`; JSON `{ok:true,destination}` e registro de clique após conferir propriedade.
- `HEAD` no mesmo endpoint: `302` com `Location`, sem contar clique. A Betel também usa HEAD para robôs, prévias e prefetch.
- Toda chamada autenticada usa `redirect: manual`; nunca segue Location com Authorization. Respostas são `private, no-store`, `no-referrer`, `noindex, nofollow`.
- `getBetelPublicOrigin()` centraliza a origem: `BETEL_PUBLIC_APP_URL`, depois os aliases existentes `NEXT_PUBLIC_APP_URL` e `NEXT_PUBLIC_SITE_URL`, com o domínio Vercel atual como padrão. Não deriva links permanentes do Host de requisições ou do `VERCEL_URL` de previews.
- A ConnectyHub mantém a origem autorizada por organização em `WHATSAPP_TRACKING_ORIGINS_JSON`. Ativar somente após a rota Betel estar publicada e o resolver validado.

## Histórico e troca futura

Mensagens e snapshots enviados não são reescritos. Os links antigos `connectyhub.com.br/w/...` continuam atendidos pela ConnectyHub. O domínio próprio futuro ainda não foi informado, comprado ou configurado. Quando existir, deve ser validado/configurado na hospedagem e na origem autorizada da ConnectyHub, além da configuração canônica Betel. O domínio anterior precisa continuar atendendo `/w/...` ou redirecionando esse caminho para preservar as mensagens históricas.

## Validação sem envios

`node scripts/branded-links.test.cjs` cobre quatro destinos esperados, isolamento da credencial, HEAD/prévias sem contagem, UUID inválido, negação de propriedade, falhas do serviço, prevenção de redirecionamento de credencial e origem canônica. Testes reais devem usar HEAD, sem seguir Location, e conferir contadores por leitura. Não enviar WhatsApp nem executar GET normal em campanhas reais para homologar.
