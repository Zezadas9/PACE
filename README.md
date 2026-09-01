# PACE

Aplicação **mobile-first** de organização pessoal, hábitos, treino, atividade
física, alimentação e performance.

Stack: **React 19 + TypeScript + Vite**, estruturada para ser empacotada com
**Capacitor** para iOS e Android sem reescrever a aplicação.

Esta fase entrega a fundação: navegação, sistema de design, onboarding, perfil,
dashboard e persistência local. Sem IA, sem pagamentos, sem autenticação.

---

## Como correr

```bash
npm install
npm run dev
```

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento em <http://localhost:5173> (e na rede local, para testar no telemóvel) |
| `npm run build` | Type-check + build de produção para `dist/` |
| `npm run typecheck` | Só o TypeScript, em modo estrito |
| `npm test` | Testes do domínio (Vitest) |
| `npm run preview` | Serve o build de produção |

Em Chrome/Edge, *DevTools → Toggle device toolbar* dá a vista de telemóvel.

---

## Arquitetura

Camadas com dependências num só sentido — de cima para baixo, nunca ao contrário.

```
src/
  core/              vocabulário e utilitários puros
    types.ts             o modelo de domínio inteiro, tipado
    constants.ts         enums, catálogo de objetivos, rotas, faixas de IMC
    factories.ts         construtores de registos, com defaults completos
    utils/               id · date · units · format
  domain/            lógica de negócio pura (sem DOM, sem storage, testada)
    metrics.ts           IMC, categoria, idade, intervalo de referência, TMB
    progress.ts          progresso diário, sequências, vista semanal
  data/              persistência
    snapshot.ts          forma do documento guardado + migrações
    store.ts             snapshot em memória, escrita debounced, reatividade
    repositories.ts      uma vista tipada por coleção
    seed.ts              conteúdo de demonstração (descartável)
  platform/          ← as portas nativas
    types.ts             uma interface por capacidade
    web/                 implementações para browser
    index.ts             resolve web vs nativo em runtime
  services/          orquestração entre dados e ecrãs
    profile.ts           criar/editar o perfil, derivar métricas
    dashboard.ts         view-model do ecrã "Hoje"
  ui/                sistema de design (Card, Chip, Ring, Row, Dialog, …)
  features/          um módulo por área
    onboarding/ today/ agenda/ workout/ activity/ nutrition/ profile/
  app/               bootstrap, providers, router, shell
  styles/            tokens · base · layout · components · screens
```

**Regras que mantêm isto escalável**

- Um ecrã nunca faz contas nem toca numa coleção: pede um view-model a um serviço.
- O domínio é puro e testado — reutilizável tal como está por um backend ou por
  uma futura camada de IA.
- Armazenamento canónico é **sempre métrico e ISO**: massa em kg, comprimento em
  cm, distância em metros, dias como `YYYY-MM-DD` locais. As unidades do
  utilizador afetam apenas a apresentação.
- Nenhum componente escreve cores ou medidas — só *tokens* CSS.
- Nenhuma feature importa um plugin nativo. Importa uma porta.

---

## Agenda, hábitos e sequência

### Escalas

A agenda tem uma única peça de estado — a data âncora — e quatro escalas
derivadas dela: **dia**, **semana**, **mês** e **ano**. Mudar de escala mantém o
dia em que estavas. A navegação não tem limites: qualquer data, passada ou
futura, é alcançável.

### Três tipos de item

| | O que é | Repete | Conta para a sequência |
| --- | --- | --- | --- |
| **Evento** | Um bloco de tempo — reunião, consulta, aula | Regra de recorrência | Nunca |
| **Tarefa** | Algo para fazer num dia | Não | Só se for marcada essencial |
| **Hábito** | Algo que se repete | Frequência própria | Só se for marcado essencial |

### Recorrência

`domain/recurrence.ts` responde a uma pergunta — esta regra produz uma ocorrência
neste dia? — para `none`, `daily`, `weekly`, `monthly` e `yearly`, cada uma com
intervalo e limite opcional.

Duas decisões que valem a pena conhecer:

- **Mensal e anual saltam em vez de encolher.** Uma regra ancorada ao dia 31 não
  produz nada em fevereiro. Encolher para 28 inventaria uma ocorrência que o
  utilizador nunca pediu, e transformaria "todo o dia 31" em "no fim de cada mês".
- **O intervalo semanal conta semanas inteiras**, não a diferença bruta de dias,
  para que "de 2 em 2 semanas, à segunda e à sexta" não se desalinhe.

Os hábitos têm a sua própria frequência (diária, dias úteis, dias específicos, de
X em X dias), porque um hábito é ancorado à data de início e não a um evento.

### O dia perfeito e a sequência

Um dia é **perfeito** quando todos os itens marcados como *essenciais* nesse dia
estão feitos. Três regras tornam isto humano em vez de punitivo:

1. Um dia **sem essenciais é neutro** — não prolonga nem quebra. Um domingo não
   deve custar a sequência só porque os hábitos são de dias úteis.
2. **Hoje nunca quebra** enquanto ainda está por terminar.
3. O que não é essencial é invisível aqui. Um email por responder não é uma
   promessa quebrada.

Quatro estados, todos derivados dos registos e nenhum guardado:
🔥 sequência atual · 🏆 melhor · 📅 dias perfeitos · 📊 consistência
(dias perfeitos sobre dias que tinham essenciais).

Avaliar um dia via `dailyProgress` é O(registos); fazê-lo para dois anos de
histórico a cada render não é aceitável, por isso `domain/streak.ts` indexa os
dados uma vez e responde a cada dia em tempo quase constante.

### Notificações locais

O planeamento é puro e testável (`domain/notifications.ts`); a entrega passa pelo
`NotificationsPort`. No browser o port declara-se indisponível e o ecrã de
definições diz isso em vez de fingir — o plano continua a ser calculado e
inspecionável.

A regra de "não criar notificações excessivas" é aplicada em dois sítios:

- **Por hábito.** Uma janela com intervalo curto gera muitas notificações. O
  formulário mostra a contagem em tempo real e, acima de 8 por dia, exige
  confirmação explícita antes de guardar. "De 30 em 30 minutos, das 08:00 às
  22:00" são 29 avisos — algo razoável de querer e péssimo de receber por acidente.
- **No total.** Um teto de 64 notificações agendadas, para que uma configuração
  má não afogue a fila do sistema operativo.

Há ainda uma janela global de silêncio no perfil, a que todas as janelas de
hábito são recortadas, e lembretes cujo instante já passou são descartados —
ambas as plataformas disparam imediatamente uma notificação agendada no passado,
o que receberia o utilizador com uma rajada de avisos velhos sempre que abrisse
a aplicação.

---

## Treino

### Criar

Um plano tem nome, tipo, duração estimada, descrição e exercícios. Os oito tipos
são musculação, funcional, calistenia, HIIT, mobilidade, Pilates, desportivo e
outro. Cada exercício guarda séries, repetições, carga, duração, descanso e notas.

Os exercícios são escritos por nome, não escolhidos de uma lista fixa: o catálogo
cresce do que as pessoas realmente treinam. Um nome que já exista é reutilizado
(comparação sem distinção de maiúsculas), senão "Supino" e "supino" partiriam o
gráfico de evolução em dois.

### Executar

A sessão tem rota própria (`/treino/sessao`) e esconde a navegação inferior —
a meio de uma série é o pior momento possível para tocar num separador por engano.

Mostra o exercício atual, a série atual, repetições e carga, o progresso, o tempo
decorrido e um cronómetro de descanso que arranca sozinho ao concluir uma série
(e só quando ainda falta alguma). Repetições e carga são editáveis no momento com
steppers: o que se planeia e o que se levanta divergem constantemente, e obrigar
a sair da série para o dizer é como os registos deixam de ser verdadeiros.

A alteração aplica-se **à série em que estás**, não retroativamente às anteriores.

No fim: duração real medida pelo relógio, exercícios e séries concluídos, volume
(ou repetições), RPE numa escala Borg CR10, dificuldade e notas.

### Histórico e evolução

Duas vistas dos mesmos registos: **sessões** (o que fizeste) e **evolução** (como
um movimento se moveu). A segunda é indexada ao exercício e não ao plano, porque
é essa que responde a "estou a ficar mais forte" — o mesmo movimento aparece em
vários planos.

O volume (reps x kg) só é mostrado onde faz sentido — musculação, calistenia,
funcional. Numa sessão de mobilidade ou num jogo, um zero honesto seria só ruído,
por isso aparecem repetições em vez disso.

### Idade e data de nascimento

O `<input type="date">` foi substituído por três controlos explícitos: dia, mês
(lista) e ano (numérico). As regras do campo nativo variam entre browsers e
plataformas, o segmento do ano é fácil de saltar no telemóvel, e um valor meio
escrito reportava-se como vazio. Uma data que não existe (31 de fevereiro) nunca
sai do componente.

A idade aceite vai dos **10 aos 130 anos**, validada no onboarding e no perfil, e
a data de nascimento passou a ser editável no perfil — antes, corrigi-la exigia
repor a aplicação inteira.

---

## Atividade

Seis tipos — corrida, caminhada, caminhada rápida, bicicleta, hiking e outro —
lidos pela métrica certa: quem corre pensa em minutos por quilómetro, quem
pedala pensa em quilómetros por hora. Mostrar a errada é o detalhe que denuncia
uma aplicação feita por quem não treina.

### Sessão em tempo real

Ecrã inteiro, sem barra de navegação: cronómetro grande, distância, ritmo e
subida, com pausa e terminar. A pausa exclui-se do tempo — `pausedTotalSec`
acumula, e o tempo decorrido mede-se do relógio em vez de um temporizador,
porque o telemóvel pode adormecer a meio.

A localização entra pelo `GeolocationPort`, nunca pelo `navigator` diretamente.
Na web é a API do browser; em nativo passa a ser a do sistema com permissões de
segundo plano, sem uma linha mudar no ecrã.

Dois filtros protegem o percurso: um ponto que o telemóvel admite ser impreciso
(>40 m) é descartado, e um ponto a menos de 8 m do anterior é ignorado — sem
isso, esperar num semáforo acrescenta cem metros de rabisco ao traçado.

### O mapa

É o traçado do percurso, não um mapa de ruas: sem fornecedor de tiles, sem chave
de API e sem chamada de rede, o que significa que funciona offline e dentro de
uma WebView com política restrita. A longitude é escalada por cos(latitude) para
o traço manter as proporções — sem isso, um percurso em Lisboa sai esticado 20%
para o lado.

### Objetivos

"Correr 20 km esta semana", "caminhar 30 minutos por dia", "bicicleta 3 vezes
por semana": tipo de atividade (ou qualquer), métrica (distância, tempo, vezes),
período (dia ou semana) e meta. O nome escreve-se sozinho a partir das escolhas.

As metas guardam-se em unidades canónicas (metros, segundos) e mostram-se nas
unidades do utilizador. O progresso aparece automaticamente no ecrã Hoje.

### Histórico

Distância, tempo e frequência por semana, mais uma linha de tendência do ritmo —
invertida, para que melhorar suba, que é o que toda a gente lê num gráfico. O
ritmo semanal é ponderado pela distância, não a média das sessões: uma corrida
longa e constante deve pesar mais do que um sprint.

### Integração com Health

Ainda não implementada, como pedido. O `HealthPort` já devolve
`ActivitySession[]` em `readWorkouts()`, e cada sessão tem `source` e
`externalId` para que uma importação repetida não duplique registos.

---

## Marca, cor e som

### O logo

O mark é desenhado em SVG por traços (`src/ui/Logo.tsx`), não importado como
imagem. Herda `currentColor`, mantém-se nítido em qualquer tamanho e sabe
desenhar-se a si próprio — o arranque e o ecrã de boas-vindas constroem-no traço
a traço com `stroke-dashoffset`, coisa que um PNG nunca faria.

A seta é traçada mais fina (14) do que a letra (21), como no original.

O ícone da aplicação vive em `public/`: `icon.svg` para tudo, e
`apple-touch-icon.png` a 180 px porque o ecrã principal do iPhone não aceita SVG.
Se quiseres o teu ficheiro original em vez da reconstrução vetorial, substitui
esses dois ficheiros — mais nada precisa de mudar.

### Cor

A paleta segue o mark: um interface essencialmente monocromático com **um só
acento vivo**, em vez de um campo de tons médios que não se comprometem. Os
neutros são ligeiramente frios, o que lê como produto e não como cinzento por
omissão. O calor fica onde significa alguma coisa — a sequência.

Tudo isto vive em tokens (`tokens.css` define a base, `polish.css` afina-a);
nenhum componente escreve uma cor.

### Cor com significado

Uma segunda camada acima do acento: cada categoria tem a sua cor, e a mesma cor
significa sempre a mesma coisa. Trabalho é azul, escola violeta, consulta rosa,
reunião âmbar, compromisso ciano, pessoal menta; os tipos de treino têm o seu
próprio mapa. Vive em `styles/hues.css`, num único sítio que decide o que cada
cor quer dizer.

A paleta é dessaturada no tema claro (cor sobre branco fica berrante depressa) e
avivada no escuro (cor sobre quase-preto fica lamacenta). Sem isto, uma lista de
seis coisas diferentes parecia uma lista de seis coisas iguais.

### Som

`services/feedback.ts` sintetiza cada aviso com WebAudio — sem ficheiros, sem
rede, nada que possa falhar dentro de uma WebView.

Os sons são modelados como uma **barra percutida** (uma marimba, um bloco de
madeira) e não como um gerador de tons. Um seno puro é exatamente aquilo a que
chamamos "bip"; um instrumento são três coisas ao mesmo tempo:

1. um transiente de maço — poucos milissegundos de ruído filtrado,
2. uma fundamental que decai exponencialmente enquanto desce ligeiramente de
   altura, como um corpo físico a perder energia,
3. um parcial inarmónico bem acima (rácio 2,76 — o modo clássico de barra), a
   decair mais depressa, que é o que o ouvido lê como "madeira".

Um passa-baixo fecha ao longo da cauda, para que o som escureça enquanto se
apaga. É esse detalhe que separa barato de caro.

**Há exatamente dois sons**, e ambos só disparam quando algo *termina*: uma
quinta ascendente quando um item fica concluído, e uma tríade maior quando um
treino ou um dia perfeito fecha. Tudo o resto — navegar, incrementar um hábito
contado, desfazer — é só vibração.

Um som que toca a cada toque deixa de ser informação e passa a ser ruído, que é
a forma mais rápida de a aplicação acabar silenciada para sempre. Som e vibração
desligam-se em **Perfil → Som e vibração**.

---

## A camada de portas nativas

É a peça que torna a passagem para iOS/Android um passo de empacotamento em vez
de uma reescrita. `src/platform/types.ts` declara uma interface por capacidade:

| Porta | Hoje (web) | Em nativo |
| --- | --- | --- |
| `StoragePort` | `localStorage` | Preferences → SQLite |
| `DevicePort` | visibilidade, vibração | back button, status bar, splash, háptica |
| `NotificationsPort` | indisponível | `@capacitor/local-notifications` |
| `GeolocationPort` | `navigator.geolocation` | GPS com permissões nativas |
| `BackgroundPort` | indisponível | execução em background durante o tracking |
| `HealthPort` | indisponível | HealthKit (iOS) · Health Connect (Android) |
| `SensorPort` | indisponível | pedómetro, wearables |
| `NetworkPort` | `navigator.onLine` | `@capacitor/network` |
| `AuthPort` | por implementar | Sign in with Apple, Credential Manager |

Cada porta responde `isAvailable()`, por isso uma feature **pergunta antes de
agir** e degrada em vez de rebentar. Um ecrã faz
`usePlatform().notifications`, nunca `import { LocalNotifications } from …`.

Adicionar uma capacidade nativa é escrever uma implementação em
`platform/capacitor/` e registá-la no resolver. Nenhum ecrã muda.

---

## Persistência

O `Store` carrega **um** snapshot no arranque, serve uma cópia síncrona em
memória e escreve de volta com *debounce*. Expõe um contador de versão que os
ecrãs subscrevem via `useSyncExternalStore` — sem biblioteca de estado.

O snapshot é forçado para disco quando a aplicação vai para segundo plano
(`DevicePort.onAppStateChange`). Num telemóvel isto não é opcional: o SO pode
suspender a app sem aviso e a escrita adiada perder-se-ia.

Mudanças de forma dos dados passam por `APP.schemaVersion` e pelo mapa
`MIGRATIONS` em `snapshot.ts`. Um snapshot de uma versão mais recente do que a
instalada é descartado em vez de adivinhado.

> **Atenção para nativo:** o `localStorage` da WebView **não** é armazenamento
> durável em iOS — o sistema despeja-o sob pressão de espaço e não o inclui nos
> backups. A implementação nativa do `StoragePort` tem de usar Preferences
> (UserDefaults / SharedPreferences) e, quando as coleções crescerem, SQLite.

---

## IMC

Calculado em `domain/metrics.ts` a partir de peso (kg) e altura (cm), com as
faixas da OMS para adultos. É apresentado **sempre** como métrica estimada, com
aviso explícito de que não é um diagnóstico médico e não considera composição
corporal.

---

## Publicar no GitHub Pages

O `.github/workflows/deploy.yml` compila e publica a cada push para `main`.
Corre `tsc`, `vite build` e os testes: um commit partido nunca chega ao
telemóvel.

**Passo manual, uma vez:** no repositório, *Settings → Pages → Build and
deployment → Source: **GitHub Actions***.

O Pages em contas gratuitas só serve repositórios **públicos**. O código fica
visível; os dados não — cada pessoa guarda os seus no próprio telemóvel, e não
há servidor nem base de dados.

### Instalar no telemóvel

Com o site publicado, no Safari do iPhone: **Partilhar → Adicionar ao Ecrã
Principal**. Fica com o ícone, sem barra de browser, e o `public/sw.js` mantém
a aplicação em cache — abre offline, sem depender de nenhum computador ligado.

Cada telemóvel tem os seus próprios dados. Não há contas nem sincronização
nesta fase.

### Trocar o ícone

`public/apple-touch-icon.png` (180×180) é o ícone do ecrã principal do iPhone,
neste momento gerado a partir da reconstrução vetorial do mark. Para usares o
ficheiro original, recorta-o num quadrado à volta do P e substitui esse
ficheiro — mais nada precisa de mudar. O original está em `PACE logo.jpeg`.

---

## Quando chegar a hora do Capacitor

Nada disto é preciso agora. Fica registado para não haver arqueologia depois.

```bash
npm install @capacitor/core @capacitor/cli
npx cap init PACE com.pace.app --web-dir=dist
npm install @capacitor/ios @capacitor/android
npm run build
npx cap add ios
npx cap add android
npx cap sync
```

`capacitor.config.ts`:

```ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.pace.app',
  appName: 'PACE',
  webDir: 'dist',
  ios: { contentInset: 'always' },
  android: { adjustMarginsForEdgeToEdge: 'auto' },
};

export default config;
```

Depois, por ordem:

1. Criar `src/platform/capacitor/` com uma implementação por porta e adicionar o
   ramo em `createPlatform()` — o ficheiro já documenta onde.
2. Trocar `StoragePort` para `@capacitor/preferences`. É a única mudança
   obrigatória para os dados ficarem seguros em iOS.
3. Ligar `@capacitor/app` ao `DevicePort.onBackButton` e ao `onAppStateChange`.
4. `@capacitor/status-bar`, `@capacitor/splash-screen` e `@capacitor/keyboard`
   (este último deve pôr `data-keyboard="open"` na raiz — o CSS já reage).
5. Notificações, GPS e Health, uma porta de cada vez.

Requisitos de build: iOS precisa de um Mac com Xcode; Android precisa do Android
Studio e de um JDK.

**Já tratado nesta fase:** `base: './'` no Vite (URLs relativas — um `/assets/…`
absoluto não resolve dentro da WebView), rotas por *hash* (sem regras de
reescrita no servidor), `viewport-fit=cover` com `env(safe-area-inset-*)`,
nenhum `window.confirm` ou `alert`, e o CSS que larga o enquadramento de desktop
quando `data-native="true"`.

---

## O que falta (fases seguintes)

- Captura real: criar hábitos, tarefas, planos de treino, sessões e refeições.
- Camada de IA (o separador ainda não existe na navegação, por desenho).
- Autenticação e sincronização com backend.
- Empacotamento nativo, seguindo a secção acima.
