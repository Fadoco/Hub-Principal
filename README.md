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

### Atualizações do aplicativo

O app Android verifica `https://fadoco.github.io/Hub-Principal/updates/version.json` ao abrir e ao voltar para primeiro plano. Quando encontra uma versão mais nova, baixa o APK em segundo plano e exibe **“Instalar atualização”**. O app verifica o SHA-256 antes de abrir o instalador; a instalação sempre depende da confirmação do usuário e, se necessário, da permissão do Android para instalar apps dessa fonte. Sem atualização, nenhum aviso é exibido.

### Publicação automática de atualizações Android

O workflow [.github/workflows/publish-pages.yml](./.github/workflows/publish-pages.yml) compila e assina o APK em um runner do GitHub quando o código do site ou Android muda na branch `main`, gera `docs/updates/version.json` e publica o site, o APK e o manifesto no GitHub Pages. O workflow também salva o último APK e manifesto em `docs/updates/` no repositório para validar corretamente a próxima versão. O processo não usa Android SDK, Java, GitHub CLI ou comandos locais durante a publicação.

Antes do primeiro build de release, configure uma única vez estes **Repository secrets** em **Settings → Secrets and variables → Actions**:

- `ANDROID_KEYSTORE_BASE64`: conteúdo Base64 da keystore de publicação original (`apk/release-signing.jks`).
- `ANDROID_KEYSTORE_PASSWORD`: senha de armazenamento da keystore.
- `ANDROID_KEY_ALIAS`: alias da chave original.
- `ANDROID_KEY_PASSWORD`: senha da chave original.

Transfira a keystore para Base64 apenas com uma ferramenta local confiável e offline; não use sites de conversão, não inclua os valores em arquivos ou comandos versionados e não os imprima em logs. Informe os valores diretamente nos campos de secrets do GitHub. Os dados de senha e alias podem ser obtidos da configuração local ignorada `apk/release-signing.properties`. O workflow reconstrói a keystore apenas durante o job, remove os arquivos temporários ao terminar e falha claramente se qualquer secret estiver ausente. **Não gere outra chave:** sem acesso seguro à keystore original, não é possível publicar atualizações compatíveis com instalações existentes.

Configure também **Settings → Pages → Build and deployment → Source → GitHub Actions** e, em **Settings → Actions → General → Workflow permissions**, permita acesso de escrita ao conteúdo do repositório para o `GITHUB_TOKEN` (o workflow declara `contents: write`, além de `pages: write` e `id-token: write`). Se houver proteção na branch `main`, permita que o `GITHUB_TOKEN` salve o APK e o manifesto de referência. O app usa o endpoint público padrão para exibir as manchetes; configure `VITE_NEWS_API_URL` como Actions variable somente se quiser substituí-lo. Depois desses ajustes únicos, envie as alterações para `main`; para um novo release, incremente `versionCode` e `versionName` em `apk/app/build.gradle`.

Como alternativa, envie pela interface web do GitHub um APK assinado para `updates/Hub-Principal.apk` e faça commit na branch `main`. O mesmo workflow valida pacote, assinatura, versão e SHA-256 contra o APK atualmente publicado, rejeita uma chave incompatível e atualiza o manifesto. O `versionCode` e a versão X.Y.Z precisam ser superiores aos publicados. O manifesto e o APK são publicados pelo GitHub Pages em `https://fadoco.github.io/Hub-Principal/updates/`; não é necessário editar ou enviar `docs/updates/` manualmente.

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

3. Opcionalmente, configure outro endereço compatível como `VITE_NEWS_API_URL` em `.env.local` (arquivo local, não versionado):

   ```text
   VITE_NEWS_API_URL=https://SEU-WORKER.workers.dev/news
   ```

4. Gere novamente a versão do GitHub Pages e publique a pasta `docs/`:

   ```powershell
   npm run build:pages
   ```

O app já usa por padrão a API pública do projeto para exibir manchetes; essa configuração só é necessária para substituir o endpoint. Para um domínio próprio, adicione a origem do site em `ALLOWED_ORIGINS` no [worker/wrangler.toml](./worker/wrangler.toml) e publique o Worker novamente.

## Publicação no GitHub Pages

O workflow do GitHub Actions gera o build em `docs/` e publica essa pasta no GitHub Pages automaticamente. `VITE_NEWS_API_URL`, quando configurada como Actions variable, substitui o endpoint padrão e também é usada no APK Android.

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
