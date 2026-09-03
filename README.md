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
    nutrition.ts         totais por refeição e por dia, com o que não sabe
    coach/               o assistente: intenções, segurança, planos, evidência
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
    nutrition.ts         refeições, plano, água, objetivos, catálogo de alimentos
    coach.ts             contexto autorizado, conversa e aplicação das propostas
  ui/                sistema de design (Card, Chip, Ring, Row, Dialog, …)
  features/          um módulo por área
    onboarding/ today/ agenda/ workout/ activity/ nutrition/ assistant/ profile/
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

## Alimentação

### A regra que manda em tudo: nunca inventar um valor

Um alimento escrito à mão, sem rótulo à frente, tem proteína **desconhecida** —
não zero. Se uma refeição tiver um alimento desses, o total de proteína dessa
refeição também é desconhecido, e não "a soma do resto".

`src/domain/nutrition.ts` existe para garantir isso. Cada total traz um número
**e** a contagem do que não conseguiu resolver:

```ts
totalsOf(items, foods) // → { values, unknown, itemCount }
```

- Um nutriente fica `null` quando nenhum item se resolveu — o ecrã escreve "—",
  nunca 0.
- Fica com número **e** asterisco quando parte se resolveu; a nota por baixo diz
  que há alimentos sem esse valor e que não entram no total.
- Um dia de comida sem rótulo aparece como desconhecido, não como um dia sem
  calorias. É essa a diferença entre registar e mentir.

### Quantidades

Cada item guarda a sua unidade (`g`, `ml`, `unidade`, `porção`) em vez de ser
convertido na entrada. Mililitros só viram gramas se o alimento tiver densidade
(`gramsPerMl`); unidades só se tiver peso por unidade (`gramsPerUnit`). 1 ml = 1 g
é verdade para a água e falso para o azeite, por isso não se assume.

Quando falta esse dado, o ecrã diz exatamente o que falta ("Falta o peso de 1
unidade") e abre o alimento a um toque — que é o momento em que a pessoa sabe a
resposta.

### Diário, plano e histórico

Três vistas, porque são três perguntas diferentes:

- **Diário** — o dia que se está a viver: energia e os cinco nutrientes, água com
  adição rápida e anulação, refeições registadas e as do plano ainda por marcar,
  objetivos. A navegação de datas é ilimitada, como na agenda.
- **Plano** — a semana decidida com antecedência: dia → refeição → alimentos →
  quantidades. Escolher vários dias de uma vez cria uma entrada por dia, porque
  "almoço igual de segunda a sexta" é o caso normal. Marcar como feita copia os
  itens para uma refeição real, e o plano fica intacto.
- **Histórico** — consistência do registo (dias registados, seguidos, %),
  energia dos últimos 14 dias e as últimas refeições. A consistência mede **o
  hábito de registar, não a qualidade da alimentação** — a app não classifica o
  que se come.

### Objetivos

Calorias, proteína, hidratos, gordura, fibra, água, número de refeições ou um
objetivo próprio, por dia ou por semana. A app **não sugere números**: uma meta é
uma decisão de quem a define, e nada aqui é uma recomendação médica. Num objetivo
"outro", a PACE assume que não sabe medir e diz "acompanhado por ti" em vez de
inventar progresso.

### O que fica preparado (e não implementado)

- `Food.source` já distingue `manual` · `database` · `barcode`, e há um único
  ponto de entrada — `resolveFood()` em `src/services/nutrition.ts` — onde uma
  base de dados de alimentos ou um leitor de códigos de barras entra sem tocar em
  mais nada.
- A IA nutricional **não** foi implementada nesta fase, por pedido. O domínio é
  puro e já devolve o que uma camada dessas precisaria de ler.

---

## A camada de IA

### A decisão que está por trás de tudo o resto

Há **dois** motores por trás do mesmo ecrã, e a mesma interface para os dois.

O **motor local** é determinístico e corre no telemóvel: lê os dados que o
utilizador autorizou, faz contas, cita a fonte e **propõe ações concretas**. A
mesma pergunta com os mesmos dados dá a mesma resposta, o que também quer dizer
que é testável — e um treinador que não se consegue testar não devia dar
conselhos a ninguém. É ele que responde quando não há backend configurado, e é
ele que continua a ser dono das ações que escrevem na aplicação.

O **motor remoto** é o Claude, através de um Cloudflare Worker (ver a secção do
backend, mais abaixo). Nunca houve — nem há — uma chave de API no bundle: uma
chave dentro de uma aplicação instalada é uma chave pública, extraída em cinco
minutos. A chave vive no Worker, o browser conhece só o endereço dele, e a
resposta do modelo é validada antes de chegar ao ecrã.

Os dois entram pela mesma porta, `AssistantPort`, e devolvem o mesmo
`CoachTurn`. Os ecrãs, o consentimento e as regras de segurança não mudam uma
linha entre um e outro:

```ts
export interface AssistantPort extends Capability {
  isRemote(): boolean;          // false no motor local: nada sai do dispositivo
  readonly engine: string;
  respond(request: AssistantRequest): Promise<AssistantReply>;
}
```

### Nunca inventar evidência

`domain/coach/references.ts` é um catálogo de referências reais, escritas por
extenso e com ligação: OMS 2020, posições da ACSM, as meta-análises de volume e
frequência de Schoenfeld, Morton 2018 para proteína, Foster 2001 para carga
interna, Buist 2008 para a regra dos 10%, o consenso da AASM sobre sono, a EFSA
sobre água.

A regra é simples e não tem meio-termo: **cada afirmação sobre treino,
recuperação, alimentação ou performance aponta para uma referência, ou é marcada
como convenção prática sem evidência forte.** O bloco `caveat` existe para isso,
e é usado — o plano de corrida diz, na cara do utilizador, que a regra dos 10%
não reduziu lesões no ensaio que a testou.

Uma citação partida não aparece: `referencesByIds` deixa cair ids que não
existem, para uma fonte inventada nunca chegar ao ecrã.

### O que a IA pode ler

Nada, por omissão. `settings.ai` guarda um interruptor geral e oito categorias
— perfil, objetivos, treinos, atividade, alimentação, hábitos, sono e feedback —
e `buildContext` monta o retrato **categoria a categoria**, de forma
deliberadamente repetitiva, para se ver o que cada autorização abre. Uma
categoria desligada não chega ao motor vazia por acaso: chega vazia por
construção, e é por isso que a resposta consegue dizer honestamente que não sabe.

O sono aparece na lista e fica desativado: ainda não há dados de sono na PACE, e
prometer o contrário seria mentir com uma caixa de seleção.

### O que faz

| Pedido | O que acontece |
| --- | --- |
| "Cria-me um treino de pernas de 45 minutos" | Monta a sessão ao contrário, a partir do orçamento de tempo: aquecimento, multiarticulares, acessório, e para quando o tempo acaba. Devolve **[Adicionar treino]**. |
| "Este treino está equilibrado?" | Lê volume semanal por grupo, frequência, distribuição, duração, RPE e descanso. Diz o que está bem, o que merece atenção, o que falta — e o que não dá para saber. |
| "Quero conseguir correr 10 km" | Progressão desde o ponto onde a pessoa está (ou desde corrida/caminhada alternadas), com subida travada em 10% e uma semana leve a cada quatro. Depois de cada sessão pergunta como correu e adapta: duas difíceis seguidas baixa, duas fáceis sobe. |
| "Como está a minha evolução?" | Tendências de consistência, volume levantado, ritmo e carga interna, com saltos de carga assinalados. |
| "Tenho consumido pouca proteína?" | Lê o diário e converte para g/kg quando há peso. Se um quarto dos alimentos não tiver valores, diz que a estimativa não chega — em vez de dar uma média decorativa. |
| "Sugere hábitos" / "Organiza a minha semana" | Propõe, com justificação e fonte. A semana mostra o que fica **intocado** antes de perguntar. |

Cada resposta que pode virar alguma coisa traz um cartão com o que exatamente
vai acontecer, e um botão. Nada é escrito na aplicação sem esse toque — e a
proposta de semana nunca mexe em compromissos que não mostrou.

### A conversa tem memória

Uma mensagem sozinha não chega. "Mas eu queria que fosse só de superiores" não
tem verbo, não tem a palavra treino e não quer dizer nada — a não ser contra o
pedido anterior, onde quer dizer tudo.

Por isso cada resposta guarda o que entendeu (`CoachTurn.intent`), e a mensagem
seguinte é lida contra ela: `refine(anterior, nova)`. O que a correção traz
ganha, o resto vem de trás. É o que faz com que "só de superiores" continue a
ser um treino de 45 minutos, e "faz antes em casa" mantenha o HIIT que estava a
ser montado.

Sem isto, o assistente respondia "não percebi" à segunda frase de qualquer
conversa normal — que foi exatamente o que aconteceu antes de existir.

### Os temas cobertos

Treino (força, HIIT, funcional, calistenia, pilates, mobilidade, com ou sem
equipamento, por grupo muscular ou por metade do corpo), corrida, caminhada e
bicicleta, alimentação e ideias de refeições, hábitos, sono, recuperação,
alongamentos, o que está marcado para hoje, e a organização da semana.

O vocabulário é deliberadamente largo — "superiores", "inferiores", "em casa",
"sem pesos", "durmo mal", "estou cansado", "quero alongar" — e quando mesmo
assim não chega, a resposta **não é um beco**: pega no que a mensagem trouxe
(um músculo, um tempo, uma distância) e oferece o passo seguinte.

### Segurança

`domain/coach/safety.ts` corre **antes** de qualquer intenção ser lida. Sinais de
urgência (dor no peito, falta de ar, desmaio) devolvem uma resposta que manda
ligar 112 e recusa dar treino ou alimentação. Sintomas, lesões, medicação,
gravidez ou perturbações alimentares encaminham para um profissional. Nos dois
casos a resposta vem **sem ações** — não há nada para adicionar a uma agenda
quando a pergunta certa é para o médico.

Os termos são propositadamente amplos: um falso positivo custa uma frase a mais
a mandar procurar ajuda, um falso negativo custa muito mais.

### Testes

58 testes no domínio do assistente cobrem o triagem clínica, a leitura de
intenções, o orçamento de tempo dos treinos, os travões da progressão de corrida,
a adaptação ao feedback, a dedução de hábitos repetidos, a continuidade da conversa e as regras de
consentimento — incluindo a mais importante: que sem dados a resposta é "não
sei", e não um número.

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

### Os ícones ilustrados

São duas folhas originais — uma sobre preto, outra sobre branco — e cada ícone
sai delas como **um ficheiro próprio** em `public/icons/`, com transparência
verdadeira. Nada de folha recortada em runtime, nada de fundo por baixo.

`tools/build-brand-icons.cjs` faz o trabalho:

- **Tira o fundo** por preenchimento a partir das margens, só onde a cor é a do
  fundo. O disco escuro do "perfil" e os corpos brancos dos ícones da segunda
  folha sobrevivem porque não estão ligados à margem.
- **Mede cada ícone ao pixel** e junta os pedaços soltos (as riscas da corrida,
  as estrelas do sono, as faíscas das chamas) ao desenho a que pertencem.
- **Limpa o ringing do JPEG e as sombras suaves** com uma rampa de opacidade
  nos pixéis encostados ao fundo — é isso que evita o halo em tema claro.
- **Normaliza**: todos ficam centrados numa tela de 192 px com a mesma área de
  segurança, por isso aparecem do mesmo tamanho visual venham de onde vierem.
- **Acerta cores onde é preciso**: a bicicleta tinha pneus pretos que
  desapareciam no escuro; os escuros são levantados para cinzento e o quadro
  azul fica como está.

Correr outra vez, se as folhas mudarem:

```bash
npm install --no-save jpeg-js pngjs && node tools/build-brand-icons.cjs
```

Quarenta ícones, entre navegação, estados vazios, definições, as três faixas de
IMC e os oito degraus da chama da sequência. O do perfil é um disco preto: no
tema escuro leva um anel discreto para não desaparecer contra o fundo.

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

## O backend: Claude através de um Cloudflare Worker

O GitHub Pages serve só o frontend. Quando o assistente responde com o Claude,
o pedido vai a um **Cloudflare Worker** publicado à parte, em `worker/`:

```
PWA (GitHub Pages) → Worker /api/coach → Anthropic Messages API → Worker → PWA
```

O Worker é a única peça que conhece a `ANTHROPIC_API_KEY`. Ela nunca está no
bundle, nunca é uma variável `VITE_*`, nunca entra num commit. O browser só
conhece `VITE_PACE_API_URL` — o endereço público do Worker.

**Sem `VITE_PACE_API_URL`, a aplicação funciona na mesma**: o assistente usa o
motor local, determinístico, que corre no dispositivo. Com a variável definida,
tenta o Claude primeiro e **cai no motor local** se a rede falhar, se o Worker
não estiver configurado, se der timeout (12 s) ou se a resposta não couber no
formato. O ecrã diz, numa linha discreta, quando isso aconteceu.

### O que o modelo pode e não pode fazer

O Claude responde **apenas** através de uma ferramenta obrigatória,
`submit_coach_turn`, e o resultado é validado com Zod no Worker antes de sair.
A validação recusa: tipos de bloco fora dos seis conhecidos, textos acima dos
limites, mais de três sugestões, e **qualquer ação**. Nesta versão `actions` é
sempre `[]` — o modelo não cria treinos, hábitos, planos nem eventos. As ações
que escrevem na aplicação continuam a nascer do motor local, onde são código e
não texto gerado, e continuam a precisar de confirmação explícita.

Os blocos de fontes são filtrados contra o catálogo real
(`src/domain/coach/references.ts`): um identificador inventado é removido antes
de chegar ao ecrã. Um teste do Worker falha se as duas listas se afastarem.

### Privacidade

O pedido leva apenas o contexto que o utilizador autorizou, categoria a
categoria, no ecrã "O que posso ler" — é o mesmo `buildContext()` de sempre.
O Worker resume esse contexto antes de o enviar ao modelo (planos, sessões
recentes, atividades, hábitos, contagens de alimentação) em vez de despejar o
snapshot. Vão também as últimas 8 mensagens da conversa, cortadas. Nada mais.

O Worker não regista mensagens, perfil, contexto nem a chave: os erros que
devolve são códigos curtos (`invalid_request`, `rate_limited`, `upstream_error`)
sem detalhes internos.

### Configurar, do zero

```bash
# 1. Dependências do frontend e do Worker
npm install
npm run worker:install

# 2. Criar o Worker na Cloudflare (uma vez; abre o browser para autenticar)
npm run worker:login

# 3. A chave da Anthropic, como secret do Worker — nunca num ficheiro
npm run worker:secret        # pede a chave e guarda-a na Cloudflare

# 4. Publicar
npm run worker:deploy        # imprime o URL: https://pace-coach.<conta>.workers.dev
```

**Modelo.** `ANTHROPIC_MODEL` está em `worker/wrangler.toml` e arranca em
`claude-sonnet-4-6`. Podes trocá-lo por outro (por exemplo `claude-opus-5`, mais
capaz e mais caro) sem tocar em código.

**Chaves ligadas a uma identidade.** Se a chave da Anthropic estiver ligada à
tua conta e não a um espaço de trabalho, a API responde `400` a dizer que falta
o `anthropic-workspace-id`. Duas saídas: criar a chave já dentro de um workspace
(no ecrã *Create Key* há um campo para isso), ou dar o identificador ao Worker:

```bash
cd worker && echo "wrkspc_o-teu-id" | npx wrangler secret put ANTHROPIC_WORKSPACE_ID
```

Encontra-lo em *console.anthropic.com* → *Settings* → *Workspaces* → clica no
workspace: fica no endereço, a seguir a `/workspaces/`.

**Diagnóstico.** Os erros trazem sempre o código HTTP de quem recusou
(`upstreamStatus`) — um número, nunca conteúdo. Para ver também a mensagem da
Anthropic durante uma investigação, publica com `--var DEBUG_UPSTREAM:1` e
volta a publicar sem essa opção quando acabares. Fica desligado por omissão
porque uma mensagem de erro pode devolver pedaços do pedido.

**Origens.** `ALLOWED_ORIGINS`, no mesmo ficheiro, é a lista separada por
vírgulas das origens autorizadas — o teu domínio do GitHub Pages e o
`http://localhost:5173` do desenvolvimento. Nunca `*`: um backend que aceita
qualquer origem é um backend que qualquer página usa à custa da tua chave.

**Frontend.** No GitHub, em *Settings → Secrets and variables → Actions →
Variables*, cria `VITE_PACE_API_URL` com o URL do Worker. É uma **variável**,
não um secret: entra no bundle de propósito.

### Correr localmente

Dois terminais:

```bash
npm run worker:dev     # Worker em http://localhost:8787
npm run dev            # frontend em http://localhost:5173
```

Para o Worker local ter chave, copia `worker/.dev.vars.example` para
`worker/.dev.vars` (ignorado pelo Git) e preenche a tua. Para o frontend falar
com ele, cria um `.env.local` na raiz:

```
VITE_PACE_API_URL=http://localhost:8787
```

### Confirmar que nenhuma chave chega ao browser

```bash
npm run build
grep -ri "sk-ant" dist/ ; echo "saída vazia = nada de chaves"
grep -ri "anthropic" dist/assets/*.js | head
```

O segundo comando não devia encontrar nada além, quando muito, de texto da
interface: o frontend não importa o SDK da Anthropic nem conhece o endereço da
API — conhece o do teu Worker. Nas DevTools, o separador *Network* mostra um só
pedido, para `…workers.dev/api/coach`, sem cabeçalho de autenticação.

### Verificações

```bash
npm run typecheck && npm test && npm run build   # frontend
npm run worker:typecheck && npm run worker:test  # Worker
```

### O que falta antes de isto ser público

O Worker tem um limite por IP (20 pedidos por minuto), e convém dizer o que
isso é: proteção básica. Cada isolate da Cloudflare tem a sua própria memória,
portanto o limite é por isolate, e um IP partilhado conta como um utilizador
só. **Antes de abrir isto ao público é preciso autenticação** — sem saber quem
está a pedir, não há forma de impor um limite por pessoa nem de responsabilizar
o uso. Um contador partilhado (Durable Object ou KV) resolve a parte técnica; a
identidade é que ainda não existe.

---

## Correção e polimento

### Tema: claro ou escuro, escolhido uma vez

A opção "sistema" saiu. A PACE tem duas caras desenhadas à mão e a escolha é
feita no **sexto passo do onboarding**, com dois cartões que mostram o que vão
fazer e aplicam o tema ao vivo. Depois disso vive no perfil, e mais nada a
pergunta. Trocar de tema faz um fundido de 280 ms — só durante a troca, porque
animar cores permanentemente custa quadros em todo o lado.

### A sequência

Deixou de ser quatro números numa grelha. Agora é uma chama que **cresce com os
dias** (oito degraus, de 1 a 365), os últimos sete dias à vista, e uma frase que
diz sempre a coisa mais útil que há para dizer: quanto falta para o recorde,
para o próximo marco, ou para fechar hoje. Um dia sem essenciais marcados
aparece com um traço, não com um círculo vazio — não foi falhado, não contava.

O aviso é discreto e tem um limite: *"Falta 1 essencial para manteres a tua
sequência."* Não há contagens decrescentes nem vermelho.

### O dia perfeito

Continua a ser **calculado**, nunca declarado: não há botão nenhum que o ligue.
`createDayEvaluator` conta os essenciais do dia — hábitos, tarefas e treinos
marcados como essenciais — e o dia só fecha quando todos estão feitos. Itens
normais da agenda não impedem nada.

Quando fecha, aparece um cartão com o troféu, a lista do que foi cumprido item a
item, a sequência e o recorde. Toca uma vez: `settings.celebration` guarda o dia
já celebrado, porque uma celebração que se repete a cada abertura deixa de ser
uma celebração.

### Som

Seis sinais, todos por acabar alguma coisa: hábito ou tarefa, treino fechado,
objetivo cumprido, sequência a subir, dia perfeito, e o fim do onboarding. São
sintetizados em WebAudio como barras percutidas — não há ficheiros para
carregar. O áudio é preparado no primeiro toque do utilizador (`unlock()`),
porque os browsers recusam iniciar som fora de um gesto e o primeiro som da
aplicação é justamente um que aparece sozinho. Se o browser recusar, não há erro
— só silêncio.

### Avatar

Iniciais, um dos oito avatares desenhados em SVG na própria aplicação, ou uma
fotografia — da câmara ou da galeria. A fotografia é cortada ao centro e
reduzida a 320 px antes de ser guardada: uma foto de telemóvel são vários
megabytes e o snapshot não é sítio para isso. Aparece no perfil e no canto do
ecrã inicial.

### Campos de hora

Escreves dois dígitos e os dois pontos aparecem sozinhos; a partir daí só entram
mais dois. "930" é lido como 09:30, porque é o que as pessoas escrevem quando
têm pressa. Está em todos os sítios onde se escreve uma hora: eventos, hábitos,
refeições, plano alimentar e a janela de silêncio das notificações.

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

A migração para a v6 (alimentação) converte `quantityG` em `quantity` + `unit` e
acrescenta plano, objetivos e registos de água. Os zeros nutricionais antigos são
**mantidos**: um 0 que nunca foi escrito não se distingue de um que foi, e manter
é o que a versão anterior já mostrava. Só os alimentos novos nascem com valores
honestamente vazios.

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

- Base de dados de alimentos e leitura de código de barras.
- Um modelo de linguagem por trás do assistente, quando houver back-end para
  guardar a chave.
- Autenticação e sincronização com backend.
- Empacotamento nativo, seguindo a secção acima.
