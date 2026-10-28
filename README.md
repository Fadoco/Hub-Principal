# Hub Principal

Dashboard pessoal de clima, previsão, cotações, imagens animadas de satélite, notícias por categoria e links úteis.

Quando fica aberto, o painel atualiza os dados a cada 30 minutos sem recarregar a página ou alterar a posição de rolagem. Se a aba estiver suspensa, a atualização acontece ao voltar a ficar visível.

O modo TV organiza o clima e as imagens do satélite lado a lado. A animação do satélite pausa quando a aba ou o painel não estão visíveis e continua ao retornar.

## Aplicativo Android

O projeto Android usa Capacitor e fica na pasta `apk/`. Para sincronizar o site e abrir o projeto no Android Studio:

```powershell
npm run sync:android
npm run open:android
```

Para gerar um APK de depuração no Windows, com Android SDK (incluindo a plataforma Android 36) e Java 21 ou superior instalados:

```powershell
npm run build:android
```

O arquivo será gerado em `apk/Hub-Principal-debug.apk` (e também em `apk/app/build/outputs/apk/debug/app-debug.apk`).

## Rodar localmente

```powershell
npm install
npm run dev
```

Abra `http://127.0.0.1:5173/`.

## Notícias no Hub

O frontend do GitHub Pages não consegue ler feeds de notícias diretamente por causa de CORS. O projeto inclui um Cloudflare Worker que busca o RSS de notícias do Bing, limita a origem e a consulta, e mantém cache por cinco minutos. Os links de busca dos cartões continuam abrindo o Google Notícias.

1. Crie uma conta Cloudflare e autentique o Wrangler:

   ```powershell
   npx wrangler login
   ```

2. Publique o Worker:

   ```powershell
   npm run deploy:news-api
   ```

   O Wrangler exibirá o endereço `workers.dev` da API. O endpoint de notícias termina em `/news`.

3. Configure esse endereço como `VITE_NEWS_API_URL` em `.env.local` (arquivo local, não versionado):

   ```text
   VITE_NEWS_API_URL=https://SEU-WORKER.workers.dev/news
   ```

4. Gere novamente a versão do GitHub Pages e publique a pasta `docs/`:

   ```powershell
   npm run build:pages
   ```

Sem essa configuração, o Hub continua oferecendo links que abrem as buscas diretamente no Google Notícias, mas não exibe manchetes dentro dos cartões. Para um domínio próprio, adicione a origem do site em `ALLOWED_ORIGINS` no [worker/wrangler.toml](./worker/wrangler.toml) e publique o Worker novamente.

## Publicação no GitHub Pages

O build de publicação é gerado em `docs/`. Configure o GitHub Pages para publicar a pasta `docs` da branch principal, ou adapte seu workflow de deploy para gerar `npm run build:pages` com `VITE_NEWS_API_URL` configurada.

O endereço atual do projeto é:

```text
https://fadoco.github.io/Hub-Principal/
```

## Fontes externas

- Open-Meteo: clima e previsão.
- INMET: animação das imagens GOES sobre o Brasil no produto Topo das Nuvens, com pré-carregamento dos próximos quadros.
- Nominatim/OpenStreetMap: busca de localização.
- AwesomeAPI: cotações USD/BRL e EUR/BRL.
- Bing Notícias: manchetes via RSS no Cloudflare Worker; Google Notícias para busca externa.

## Comandos

```powershell
npm run build
npm run build:pages
npm run lint
npm run preview
```
