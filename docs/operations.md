# Operations

RelayHQ is an always-on local control plane. The canonical development port is `4310`.

## Start RelayHQ

```bash
pm2 start ecosystem.config.cjs && pm2 save
```

## Verify RelayHQ

```bash
curl http://127.0.0.1:4310/api/health
```

Expected response shape:

```json
{
  "status": "ok",
  "version": "0.0.0",
  "uptime": 12.34,
  "vaultRoot": "/path/to/RelayHQ-vault-first"
}
```

## Notes

- PM2 runs the Nuxt app from `app/` on port `4310`.
- Start RelayHQ before using MCP tools, HTTP clients, or the RelayHQ CLI.
- If MCP tools report the backend is down, restart the server with `pm2 start ecosystem.config.cjs` and re-check `/api/health`.
