# APK para atualização (alternativa manual)

Para publicar manualmente, envie pela interface web do GitHub um APK para `updates/Hub-Principal.apk` e faça commit diretamente na branch `main`. O workflow valida o pacote `com.fadoco.hubprincipal`, a assinatura contra o APK atualmente publicado, a versão e o `versionCode`, calcula o SHA-256 e publica o APK e `version.json` no GitHub Pages.

A versão X.Y.Z e o `versionCode` precisam ser superiores aos atualmente publicados. APKs com assinatura diferente são recusados; não substitua nem regenere a chave de publicação original. O fluxo recomendado é alterar o código e deixar o GitHub Actions compilar e assinar o release com os secrets configurados.
