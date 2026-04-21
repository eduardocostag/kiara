# Grafana Senior Patterns

## Dashboard vazio

- Validar datasource, time range, timezone e variaveis antes de culpar query.
- Confirmar se o dado existe na origem.
- Separar falha do painel de falha do datasource.

## Datasource com erro

- Diferenciar:
  - conectividade
  - credencial/token
  - TLS/certificado
  - permissao
  - query invalida
  - indisponibilidade da origem

## Alerting

- Perguntar qual regra, qual datasource e qual janela de avaliacao.
- Separar alerta mal calibrado de ausencia real de dado.

## Estilo de resposta

- Sempre dizer o que validar no Grafana e o que validar na origem do dado.
