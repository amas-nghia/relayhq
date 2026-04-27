import { createServer, type Server } from 'node:http'
import { URL } from 'node:url'
import { completeEntry, failEntry } from './oauth-state'

const PORT = 1455
const CLOSE_HTML = `<!doctype html><html><head><title>RelayHQ</title></head>
<body style="font-family:monospace;padding:2rem;background:#1c1917;color:#f5f5f4">
<p>✓ Connected to OpenAI — you can close this tab.</p>
<script>setTimeout(()=>window.close(),1500)</script></body></html>`

let activeServer: Server | null = null
let activeState: string | null = null

export function startOpenAICallbackServer(state: string, codeVerifier: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // close any existing server
    if (activeServer) {
      activeServer.close()
      activeServer = null
    }

    const server = createServer(async (req, res) => {
      if (!req.url) return
      let url: URL
      try { url = new URL(req.url, `http://localhost:${PORT}`) } catch { return }
      if (url.pathname !== '/auth/callback') return

      const code = url.searchParams.get('code')
      const receivedState = url.searchParams.get('state')

      res.writeHead(200, { 'content-type': 'text/html' })
      res.end(CLOSE_HTML)

      server.close()
      activeServer = null
      activeState = null

      if (!code || receivedState !== state) {
        failEntry(state, 'Invalid callback params')
        return
      }

      try {
        const tokenRes = await fetch('https://auth.openai.com/oauth/token', {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: `http://localhost:${PORT}/auth/callback`,
            client_id: 'app_EMoamEEZ73f0CkXaXp7hrann',
            code_verifier: codeVerifier,
          }),
        })
        if (!tokenRes.ok) {
          const text = await tokenRes.text()
          failEntry(state, `Token exchange failed: ${text}`)
          return
        }
        const data = await tokenRes.json() as { access_token?: string; error?: string }
        if (data.access_token) {
          completeEntry(state, data.access_token)
        } else {
          failEntry(state, data.error ?? 'No access token')
        }
      } catch (err) {
        failEntry(state, err instanceof Error ? err.message : 'Token exchange error')
      }
    })

    server.on('error', (err) => {
      if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
        reject(new Error(`Port ${PORT} is in use — close other OpenAI CLI sessions first`))
      } else {
        reject(err)
      }
    })

    server.listen(PORT, '127.0.0.1', () => {
      activeServer = server
      activeState = state
      // auto-close after 10 min
      setTimeout(() => {
        if (activeState === state) {
          server.close()
          activeServer = null
          activeState = null
          failEntry(state, 'Timed out waiting for callback')
        }
      }, 10 * 60 * 1000)
      resolve()
    })
  })
}
