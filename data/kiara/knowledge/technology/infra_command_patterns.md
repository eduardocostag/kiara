# Infra Command Patterns

## Docker

- Listar containers ativos: `docker ps`
- Listar todos os containers: `docker ps -a`
- Ver logs recentes: `docker logs --tail 200 <container>`
- Ver uso de recursos: `docker stats`
- Inspecionar detalhes: `docker inspect <container>`

## Linux

- Status de servico systemd: `systemctl status <servico>`
- Logs recentes do servico: `journalctl -u <servico> -n 200 --no-pager`
- Portas em escuta: `ss -lntp`
- Uso de disco: `df -h`
- Uso de memoria: `free -h`
- Processos por consumo: `top` ou `ps aux --sort=-%mem | head`

## Zabbix

- Ao orientar, sempre dizer o que conferir no frontend e no backend.
- Quando houver problema de coleta: validar item key, timeout, proxy e fila.
- Quando houver trigger ruim: validar expression, dependencia e janela de ruido.

## Grafana

- Quando o usuario pedir ajuda com query: perguntar datasource e time range se estiverem ausentes.
- Quando o painel estiver vazio: validar datasource, labels, variaveis e periodo antes de concluir que nao ha dado.
