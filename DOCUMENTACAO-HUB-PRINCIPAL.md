# Documentação completa do site Hub Principal

## 1. Visão geral

O Hub Principal é uma dashboard pessoal em React que reúne em uma única interface:

- clima em tempo real e previsão;
- localização do usuário via geolocalização;
- mapa interativo com Leaflet;
- cotações de moedas (Dólar e Euro em relação ao Real);
- notícias por categoria;
- links úteis para ferramentas e serviços;
- radar meteorológico com redirecionamento para o site oficial do IPMet;
- suporte a instalação como app PWA.

O projeto tem uma estética "cyberpunk"/"command center", com fundo escuro, elementos em azul e ciano, como se fosse um painel de monitoramento.

---

## 2. Tecnologias utilizadas

### Front-end
- React 19
- TypeScript
- Vite
- CSS puro

### Bibliotecas adicionais
- Leaflet + react-leaflet: mapa interativo
- lucide-react: ícones
- OpenStreetMap / Nominatim: localização e tiles do mapa
- Open-Meteo: previsão meteorológica
- AwesomeAPI: cotações de moedas
- RSS2JSON + Google News RSS: notícias
- manifest + service worker: PWA

### Estrutura de build
- `npm run dev` para desenvolvimento
- `npm run build` para build padrão
- `npm run build:pages` para gerar saída em `docs/` para GitHub Pages

---

## 3. Estrutura do projeto

```text
Projeto Hub/
├─ index.html
├─ package.json
├─ README.md
├─ tsconfig.json
├─ tsconfig.app.json
├─ tsconfig.node.json
├─ vite.config.ts
├─ public/
│  ├─ manifest.webmanifest
│  ├─ sw.js
│  ├─ icon-192.svg
│  └─ icon-512.svg
├─ docs/
│  ├─ index.html
│  ├─ manifest.webmanifest
│  ├─ sw.js
│  └─ assets/
├─ src/
│  ├─ App.tsx
│  ├─ App.css
│  ├─ index.css
│  ├─ main.tsx
│  └─ assets/
└─ DOCUMENTACAO-HUB-PRINCIPAL.md
```

### Ponto importante
O `public/sw.js` e o `manifest.webmanifest` fazem o projeto funcionar como Progressive Web App (PWA), permitindo instalação e carregamento mais rápido em dispositivos.

---

## 4. Como o site funciona no nível prático

### 4.1 Inicialização
A aplicação entra em `src/main.tsx`:

- carrega o CSS global;
- importa `App`;
- dentro de `StrictMode`, renderiza o app no `#root`;
- registra o Service Worker no navegador se o suporte existir.

Código principal:

```tsx
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`)
  })
}
```

Isso torna o app mais próximo de um aplicativo web instalado em tela inicial.

### 4.2 Estado principal em `App`
A lógica central está em `src/App.tsx` dentro do componente `App`. Ele mantém estados como:

- `now`: relógio em tempo real
- `location`: coordenadas + cidade + estado + país
- `weather`: dados meteorológicos de Open-Meteo
- `weatherError`: erro de clima
- `loadingWeather`: indicador de carregamento
- `lastUpdated`: hora do último refresh

Esses estados são atualizados por `useEffect`, que fazem a aplicação reagir automaticamente a mudanças de geolocalização e tempo.

---

## 5. Fluxo do funcionamento do site

### 5.1 Relógio e data
No topo do painel, o site exibe:

- data em texto por extenso (`Intl.DateTimeFormat`);
- horário do navegador em tempo real;
- zona local do dispositivo (`Intl.DateTimeFormat().resolvedOptions().timeZone`).

Esse comportamento é feito por um `setInterval` que atualiza o estado `now` a cada segundo:

```tsx
useEffect(() => {
  const timer = window.setInterval(() => setNow(new Date()), 1000)
  return () => window.clearInterval(timer)
}, [])
```

### 5.2 Geolocalização
O site tenta obter a geolocalização do usuário via `navigator.geolocation.getCurrentPosition(...)`.

Se a permissão for aceita:
- coleta latitude e longitude;
- consulta a API do Nominatim (OpenStreetMap) com `reverse` para receber cidade, estado e país;
- salva em `location`.

Se falhar:
- mostra mensagem de erro;
- informa ao usuário que as permissões do navegador precisam ser permitidas.

Importante: em produção no GitHub Pages, o navegador geralmente exige HTTPS ou localhost para geolocalização. O README do projeto já sinaliza isso.

### 5.3 Clima e previsão
Quando a localização se torna disponível, o componente dispara `loadWeather(location)`.

A API usada é a Open-Meteo com parâmetros como:

- latitude
- longitude
- timezone: auto
- previsão para 6 dias
- dados atuais e horários
- dados diários

Parâmetros relevantes:

```tsx
const params = new URLSearchParams({
  latitude: String(coordinates.latitude),
  longitude: String(coordinates.longitude),
  timezone: 'auto',
  forecast_days: '6',
  current: 'temperature_2m,...',
  hourly: 'temperature_2m,precipitation_probability,weather_code',
  daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset'
})
```

Depois, a aplicação:
- calcula o código do clima atual;
- mostra temperatura, sensação térmica, umidade, vento, pressão, chuva e visibilidade;
- monta lista de previsão por horas e por dias;
- atualiza automaticamente a cada 5 minutos por padrão.

### 5.4 Mapa interativo
A aplicação usa `react-leaflet` para renderizar um mapa centrado na localização do usuário.

Componentes principais:
- `MapContainer`
- `TileLayer` (OpenStreetMap)
- `Marker` para posicionar o ponto atual
- `RecenterMap` para centralizar o mapa quando a localização muda

O mapa tem duas formas de exibição:
- com localização disponível: mostra o ponto e centraliza o mapa;
- sem localização: mostra uma área de placeholder com a mensagem de espera.

---

## 6. Componentes principais e dinâmica da interface

### 6.1 `WeatherIcon`
Responsável por transformar o código meteorológico em um ícone visual. Exemplo:

- `0`: céu limpo → sol
- `51+`: garoa/chuva → nuvem com gotas
- `95+`: trovoada → nuvem de chuva

Isso dá unidade visual ao painel de clima.

### 6.2 `Metric`
Renderiza cartões com indicadores tipo:

- Umidade
- Vento
- Pressão
- Chuva agora
- Visibilidade
- UV
- Nuvens

Os valores vêm de `weather.current`, já convertidos em texto com `formatNumber`.

### 6.3 `CurrencyPanel`
Busca cotações em tempo real na AwesomeAPI:

```tsx
fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL')
```

Exibe:
- dólar
- euro
- valor em reais
- porcentagem de variação
- atualizações a cada 60 segundos

### 6.4 `NewsPanel`
Busca notícias por categoria de forma dinâmica:

- Notícias locais
- Jogos
- Filmes
- Animes
- Mundo/internacional

A busca usa RSS do Google News e passa por um proxy externo (`rss2json`).

Funções relevantes:
- `normalizeNewsItems`: remove duplicados e ordena por data
- `smartQuery`: ajusta termos para melhorar a busca semântica
- `sessionStorage`: usa cache em memória para reduzir requisições repetidas

### 6.5 `UsefulSites`
Lista sites úteis em cards com:

- nome do serviço
- breve descrição
- link externo

Exemplos presentes:
- remover fundo de imagens
- PDF tools
- melhoria de imagem
- ChatGPT
- SAAEB
- CPFL

### 6.6 `InstallApp`
É um componente que observa o evento `beforeinstallprompt`, que é disparado quando o navegador aceita a instalação de um PWA.

Se disponível, o botão aparece e permite instalar a página como app.

---

## 7. Radar meteorológico

O site possui uma seção de radar com uma mensagem explícita:

> O IPMet bloqueia incorporações dentro de outros sites.

Ou seja, a página não consegue embutir diretamente o radar da instituição. Em vez disso, ela mostra uma área informativa e disponibiliza links diretos para:

- página do radar principal;
- satélite meteorológico;
- radar animado PPI;
- imagem com cidades;
- radar GIS satélite.

Esses links são chamados pela função `openRadarWindow`, que abre a janela em segundo plano com tamanho maior.

### Links principais do radar
```ts
const radarPageUrl = 'https://www.ipmetradar.com.br/2mobileGis.php'
```

E uma lista de fontes:

- Satélite meteorológico
- Radar animado PPI
- Imagem com cidades
- Radar GIS satélite

Isso funciona como uma ótima alternativa para manter o usuario no hub sem perder a funcionalidade do monitoramento oficial.

---

## 8. Como os links são usados no site

O projeto usa duas formas principais de navegação externa:

### 8.1 `target="_blank"`
Para abrir o destino em nova aba.

Exemplo:
```tsx
<a href={site.url} target="_blank" rel="noreferrer">
```

### 8.2 `window.open(...)` com customização
Existe uma camada extra para melhorar a experiência:

```tsx
function openSecondaryWindow(url: string) {
  const popup = window.open(url, '_blank', 'noopener,noreferrer,width=1280,height=900')
  if (!popup) window.location.href = url
}
```

Isso faz duas coisas:
- abre uma janela maior para conteúdo externo;
- se o navegador bloquear popup, o site redireciona normalmente.

Esse padrão é usado em:
- links de notícias;
- sites úteis;
- radar oficial;
- botões de fontes externas.

---

## 9. Estilo visual e experiência de interface

A identidade visual da página está em `src/App.css` e `src/index.css`.

### Elementos visuais principais
- fundo escuro em azul-escuro e roxo;
- destaques em ciano e rosa;
- bordas finas com brilho;
- cards com transparência e gradientes;
- tipografia em estilo terminal/cyberpunk;
- linhas e ícones que simulam painel de operação.

O layout é responsivo, com ajustes para telas menores usando media queries. Há melhorias específicas para:
- 800px
- 560px
- celulares e tablets

### Tema visual
A interface tem uma abordagem bastante forte de UI "dashboard operacional"
com aparência de centro de comando, diferente de um site corporativo tradicional.

---

## 10. PWA e instalação

O projeto registra um Service Worker em `public/sw.js`.

### O que ele faz
- armazena shell da aplicação em cache;
- permite acesso offline para assets básicos;
- atualiza cache antigo;
- serve conteúdo em fallback em casos de falha de rede.

### Arquivos importantes
- `manifest.webmanifest`
- `icon-192.svg`
- `icon-512.svg`
- `sw.js`

Esse conjunto permite que o site seja "instalável" e tenha aparência de app nativo em alguns navegadores.

---

## 11. Regras de segurança e limitações

### 11.1 APIs externas
O site depende de serviços fora do projeto:

- Open-Meteo para clima
- Nominatim para geolocalização reversa
- RSS2JSON para notícias
- AwesomeAPI para cotações

Isso significa que:
- a funcionalidade depende de internet;
- pode haver taxa de limite ou indisponibilidade;
- podem ocorrer falhas de CORS ou bloqueios por parte de provedores.

### 11.2 Navegador
A geolocalização exige permissões do usuário. Sem isso, a UI mostra mensagens de aviso.

### 11.3 Radar
Como o IPMet bloqueia embeds, a página usa redirecionamento para o site oficial ao invés de incorporar o sensor diretamente.

---

## 12. Pontos fortes do site

- interface enxuta e funcional
- dashboard com várias informações em uma tela só
- uso de dados em tempo real
- boa experiência mobile e desktop
- uso de PWA para instalação
- navegação com múltiplos fluxos de informação
- integração com APIs públicas sem backend próprio

---

## 13. Possíveis melhorias

### 13.1 Melhor organização do código
Hoje o arquivo `src/App.tsx` concentra muita lógica. O ideal seria dividir em componentes menores, por exemplo:

- `WeatherSection`
- `LocationMap`
- `NewsSection`
- `CurrencySection`
- `UsefulLinksSection`

Isso reduz complexidade e facilita manutenção.

### 13.2 Tratamento de erros mais robusto
O site poderia melhorar a UX com:

- toasts de erro específicos;
- retry automático com backoff;
- estados de loading mais detalhados;
- mensagens de fallback quando API externa falha.

### 13.3 Cache mais inteligente
Para melhorar performance e reduzir requisições:

- cache de localidade no `localStorage`;
- cache de clima por horário;
- limite de age para notícias por categoria;
- estratégia de revalidação quando dados expirarem.

### 13.4 Melhor acessibilidade
Melhorias relevantes:

- contraste de texto em algumas áreas;
- foco visível em botões e links;
- labels para ícones e ações;
- uso mais consistente de `aria-label`;
- suporte melhor para leitores de tela.

### 13.5 Mais personalização
O usuário poderia configurar:

- cidade favorita;
- categorias de notícias preferidas;
- unidades de temperatura (Celsius/Fahrenheit);
- tema claro/escuro;
- módulo de ocultar/mostrar cards.

### 13.6 Melhor tratamento para instalação e offline
- avisar melhor quando o app estiver disponível offline;
- sincronizar dados em cache quando houver rede;
- permitir "refresh" manual de PWA após atualização.

### 13.7 Segurança e confiabilidade
- validar respostas das APIs antes de renderizar;
- evitar processamento em dados inconsistentes;
- padronizar nomes de funções e tipos;
- adicionar testes automatizados com Vitest ou React Testing Library.

### 13.8 SEO e compartilhamento
Para um site público, seria útil:

- meta tags mais ricas;
- Open Graph;
- estrutura de microdados;
- descrição melhor para indexação.

---

## 14. Resumo da arquitetura

O site funciona como uma dashboard SPA com integração direta a APIs externas e UI em um único arquivo principal (`App.tsx`), reforçada por CSS customizado para um visual de painel cyberpunk.

Em resumo, a arquitetura é:

1. carregamento da aplicação;
2. captura da localização do usuário;
3. busca de clima em API pública;
4. busca de notícias por categoria;
5. consulta de cotações de mercado;
6. exibição em cards, mapa, status e links externos;
7. registro de PWA para instalação e cache.

---

## 15. Conclusão

O Hub Principal é um dashboard funcional, moderno e bem visualizado, que reúne informações úteis em um único lugar. Ele funciona como uma central de monitoramento pessoal, com destaque para clima, notícias e serviços do dia a dia.

Ele já está em um nível funcional muito bom para uso pessoal ou como ponto de partida para um produto mais robusto. As maiores oportunidades de evolução estão na organização do código, acessibilidade, testes, cache e personalização.

---

## 16. Informações rápidas para manutenção

### Comando para rodar localmente
```bash
npm install
npm run dev
```

### Build de produção
```bash
npm run build
```

### Build para GitHub Pages
```bash
npm run build:pages
```

### Publicação
O projeto está pronto para publicar em GitHub Pages com a saída em `docs/`.

---

Se quiser, posso continuar e transformar essa documentação em uma versão ainda mais profissional, com:

- capa + sumário;
- explicação por telas;
- fluxograma do funcionamento;
- checklist de melhorias em ordem de prioridade;
- documento em formato de apresentação ou README pronto para GitHub.
