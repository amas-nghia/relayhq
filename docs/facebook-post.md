# Facebook Post — RelayHQ Launch

---

Mình đang build một project và muốn chia sẻ sớm để nghe ý kiến mọi người 👇

**RelayHQ — bộ điều phối cho đội human + AI agent**

⚠️ Dự án đang trong giai đoạn phát triển — còn nhiều thứ chưa hoàn thiện, nhưng core đã chạy được và mình đang dùng hàng ngày.

---

Chuyện là thế này.

Mình đang dùng Claude Code để code mỗi ngày. Rồi mình thêm một agent nữa. Rồi thêm một cái nữa. Và bắt đầu có vấn đề:

❌ Không biết agent đang làm gì
❌ Hai agent tự dưng làm trùng nhau
❌ Agent tự ý sửa thứ không ai cho phép
❌ Xong việc rồi nhưng không biết nó làm gì, ai approve

Mình tự hỏi: có tool nào giải quyết cái này không?

Không có. Vậy mình tự build.

---

**Ý tưởng cốt lõi:**

→ Bạn tạo task, define tiêu chí chấp nhận
→ RelayHQ tự route đúng agent, lock task lại để không ai claim trùng
→ Agent làm việc, gửi heartbeat mỗi 10 phút
→ Nếu cần approve? Agent dừng lại chờ — không gì tiếp tục nếu chưa có người OK
→ Xong. Ghi vào vault. Commit Git. Audit trail đầy đủ.

**Điểm mình thích nhất:** mọi task đều là file Markdown trong Git repo. Không database. Không vendor. Đọc được bằng mắt thường. Mất RelayHQ vẫn còn data.

---

**Tech stack:**
- Nuxt 3 + Bun (API)
- React 19 + Vite (UI)
- Vault = plain Markdown files + Git
- MCP server cho Claude Code / Cursor / Antigravity

**Thử luôn nếu muốn:**
```
git clone https://github.com/amas-nghia/relayhq
cd relayhq
pm2 start ecosystem.config.cjs
```

Mở localhost:44211 là có UI, wizard 3 bước setup xong trong 5 phút.

---

Mình open-source sớm vì muốn nghe feedback thật từ người thật — không phải đợi "xong hẳn" rồi mới show.

Nếu bạn đang làm việc với AI agent, mình rất muốn biết:
💬 Bạn đang gặp vấn đề gì khi quản lý agent?
💬 RelayHQ thiếu gì để bạn có thể dùng được?
💬 Có feature nào bạn thấy quan trọng hơn không?

Mọi góp ý đều cực kỳ có giá trị ở giai đoạn này 🙏

🔗 GitHub: github.com/amas-nghia/relayhq
📖 Docs: amas.gitbook.io/relayhq
🎥 Demo: https://www.loom.com/share/496c1d58c33a435f826ad8f620191eab

#AI #OpenSource #ClaudeCode #DevTools #AIAgent #BuildInPublic
