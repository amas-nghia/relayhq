<p align="center">
  <img src="docs/assets/logo.png" alt="RelayHQ" width="120" />
</p>

<h1 align="center">RelayHQ</h1>

<p align="center">
  <strong>Kanban board cho đội human + AI agent. Git là database của bạn.</strong>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License" /></a>
  <a href="https://github.com/amas-nghia/relayhq/stargazers"><img src="https://img.shields.io/github/stars/amas-nghia/relayhq?style=social" alt="Stars" /></a>
  <img src="https://img.shields.io/badge/status-work%20in%20progress-yellow" alt="WIP" />
  <img src="https://img.shields.io/badge/works%20with-Claude%20Code%20%C2%B7%20Cursor%20%C2%B7%20OpenCode-orange" alt="Runtimes" />
</p>

<p align="center">
  <a href="https://amas.gitbook.io/relayhq">📖 Docs</a> ·
  <a href="https://amas.gitbook.io/relayhq/getting-started">🚀 Getting Started</a> ·
  <a href="docs/connect.md">🔌 Connect Agent</a> ·
  <a href="docs/roadmap.md">🗺️ Roadmap</a>
</p>

---

<p align="center">
  <a href="https://www.loom.com/share/496c1d58c33a435f826ad8f620191eab">
    <img src="docs/assets/demo.gif" alt="Watch the RelayHQ demo" width="720" />
  </a>
  <br/>
  <sub>▶ Click để xem demo</sub>
</p>

---

## Vấn đề

Bạn đang chạy Claude Code, Cursor, hay OpenCode. Agent làm việc — nhưng bạn không biết **nó đang làm gì**, **có dẫm lên agent khác không**, và **ai approve trước khi nó đụng vào production**.

RelayHQ giải quyết đúng cái đó. Không hơn, không kém.

---

## RelayHQ làm gì

**🎯 Phân công việc tự động** — Tạo task, RelayHQ tự route đến agent phù hợp dựa trên capability. Không cần tay assign từng cái.

**🔒 Không bao giờ có 2 agent làm cùng 1 việc** — Task bị lock ngay khi agent claim. Nếu agent im lặng quá 10 phút không heartbeat, lock tự hết hạn và task trả về pool.

**✋ Approval gate** — Agent không thể tự chuyển sang `done`. Xong việc thì chờ bạn review — approve hoặc gửi lại kèm feedback. Không gì tiếp tục nếu chưa có người OK.

**📋 Audit trail đầy đủ** — Mọi action đều được ghi lại. Ai làm gì, lúc nào, kết quả là gì — tất cả trong plain Markdown, commit vào Git.

**📁 Vault-first** — Không database. Không cloud. Mọi task là một file Markdown trong repo của bạn. Đọc được bằng mắt thường, versionable, và vẫn còn đó nếu bạn ngừng dùng RelayHQ.

---

## Bắt đầu

**Yêu cầu:** [Bun](https://bun.sh) · [PM2](https://pm2.keymetrics.io) · [Node.js 18+](https://nodejs.org)

```bash
git clone https://github.com/amas-nghia/relayhq.git
cd relayhq
pm2 start ecosystem.config.cjs
```

Mở **[http://localhost:44211](http://localhost:44211)** — onboarding wizard 3 bước hướng dẫn setup xong trong 5 phút.

Xem hướng dẫn chi tiết → [Getting Started](https://amas.gitbook.io/relayhq/getting-started)

---

## Kết nối agent của bạn

| Agent | Cách kết nối |
|-------|-------------|
| **Claude Code** | MCP server — [hướng dẫn](docs/connect.md#claude-code) |
| **Cursor** | MCP server — [hướng dẫn](docs/connect.md#cursor) |
| **OpenCode** | MCP server — [hướng dẫn](docs/connect.md#opencode) |
| **Codex CLI** | MCP server — [hướng dẫn](docs/connect.md#codex-cli) |
| **Bất kỳ tool nào** | HTTP API trực tiếp — [hướng dẫn](docs/connect.md#any-tool) |

---

## Trạng thái dự án

> ⚠️ **Work in progress** — Core đã chạy được và đang được dùng thực tế, nhưng vẫn còn nhiều thứ đang phát triển. Mọi feedback, bug report, và góp ý đều rất được chào đón.

Xem những gì đã xong và sắp tới → [Roadmap](docs/roadmap.md)

---

## Góp ý & đóng góp

Dự án đang ở giai đoạn sớm và cần feedback thật từ người dùng thật.

- **Thấy bug?** → [Mở issue](https://github.com/amas-nghia/relayhq/issues)
- **Có ý tưởng?** → [Thảo luận](https://github.com/amas-nghia/relayhq/discussions)
- **Muốn contribute?** → [Xem roadmap](docs/roadmap.md) rồi mở PR

---

## License

MIT — dùng, sửa, fork thoải mái. Xem [LICENSE](LICENSE).
