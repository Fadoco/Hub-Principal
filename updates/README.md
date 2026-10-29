# APK para atualização

Coloque aqui o APK Android assinado com a chave permanente e nomeie-o `Hub-Principal.apk`.

Depois execute:

```powershell
npm run prepare:android-update
```

O comando valida o APK, gera o manifesto SHA-256 e copia ambos para `docs/updates/`, a pasta publicada pelo GitHub Pages. Faça commit e push das alterações de `docs/` para disponibilizar a atualização no app.
