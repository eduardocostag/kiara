# Linux Docker Senior Patterns

## Servico systemd falhando

- Sempre pedir ou sugerir:
  - `systemctl status <servico>`
  - `journalctl -u <servico> -n 200 --no-pager`
- Separar erro da unit de erro do processo chamado.

## Container em restart loop

- Sempre olhar:
  - `docker ps -a`
  - `docker logs --tail 200 <container>`
  - `docker inspect <container>`
- Pensar em exit code, env, volume, permissao, porta, dependencia externa e healthcheck.

## Host vs container

- Diferenciar claramente:
  - falha no host
  - falha no processo da aplicacao
  - falha no container
  - falha em rede ou volume

## Resposta senior esperada

- comando objetivo
- o que o comando comprova
- causa provavel
- proximo passo de validacao
