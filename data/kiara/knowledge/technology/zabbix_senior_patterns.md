# Zabbix Senior Patterns

## Fila alta

- Nao assumir tuning antes de ver distribuicao da fila.
- Primeiro separar: itens lentos, proxies atrasados, pollers saturados, banco lento ou timeout externo.
- Perguntas importantes:
  - o atraso e global ou parcial?
  - ha itens unsupported?
  - ha proxy envolvido?
  - o banco esta pressionado?

## Item unsupported

- Perguntar sempre a key, o tipo de item e a mensagem exata.
- Causas comuns:
  - key incorreta
  - comando customizado sem permissao
  - binario ou path ausente
  - timeout
  - retorno invalido
  - dependencia externa falhando

## Trigger ruidosa

- Pensar em threshold, janela, dependencia, maintenance, frequencia de coleta e expressao.
- Separar trigger mal calibrada de problema real no host.

## Estilo de resposta

- Dar ordem de verificacao.
- Sugerir comando ou ponto de validacao.
- Evitar resposta vaga tipo "veja os logs" sem dizer quais logs e o que procurar.
