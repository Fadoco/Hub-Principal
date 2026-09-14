# Hub Principal

Dashboard cyberpunk de clima, previsao, cotacoes, radares IPMet e portais de noticias.

## Rodar localmente

```bash
npm install
npm run dev
```

Abra `http://127.0.0.1:5173/`.

## Publicar no GitHub Pages

Este projeto ja esta configurado para o repositorio `https://github.com/Fadoco/Hub-Principal.git`.

1. Envie os arquivos para a branch `main`.
2. No GitHub, abra **Settings > Pages**.
3. Em **Build and deployment**, selecione **GitHub Actions**.
4. Aguarde o workflow `Deploy Hub Principal` em **Actions**.

O workflow em `.github/workflows/deploy.yml` instala as dependencias, gera o build com o caminho correto do repositorio e publica automaticamente a cada push.

O endereco sera:

```text
https://fadoco.github.io/Hub-Principal/
```

## Fontes externas

- Open-Meteo: clima e previsao.
- Nominatim/OpenStreetMap: localizacao reversa e mapa.
- AwesomeAPI: cotacoes USD/BRL e EUR/BRL.
- Google News RSS via RSS2JSON: portais de noticias.
- IPMet/Unesp: links oficiais de radar e satelite.

O GitHub Pages hospeda apenas o frontend. As APIs externas precisam continuar acessiveis e podem aplicar limites, CORS ou indisponibilidade. A localizacao exige HTTPS, condicao atendida pelo GitHub Pages.

## Comandos

```bash
npm run build
npm run lint
npm run preview
```
