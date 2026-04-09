import { useEffect, useState } from 'react'

const phases = [
  {
    title: 'Phase 1',
    items: ['Project registry', 'Task board', 'Assignment', 'Approvals', 'Audit notes'],
  },
  {
    title: 'Next up',
    items: ['Plans', 'Chat', 'Reminders', 'Progress tracking'],
  },
  {
    title: 'Later',
    items: ['Customer reporting', 'Agent improvement loops'],
  },
]

export default function App() {
  const [apiStatus, setApiStatus] = useState('checking...')

  useEffect(() => {
    let active = true

    fetch('/healthz')
      .then((response) => response.json())
      .then((payload: { status?: string }) => {
        if (active) {
          setApiStatus(payload.status ?? 'unknown')
        }
      })
      .catch(() => {
        if (active) {
          setApiStatus('unreachable')
        }
      })

    return () => {
      active = false
    }
  }, [])

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">RelayHQ</p>
        <h1>Control plane for agent-assisted work.</h1>
        <p className="lede">
          Coordinate projects, people, and agents in one place. Track ownership, approvals,
          history, and progress without turning the system into a black box.
        </p>
        <p className="lede">
          Backend health: <strong>{apiStatus}</strong>
        </p>
      </section>

      <section className="grid">
        {phases.map((phase) => (
          <article className="card" key={phase.title}>
            <h2>{phase.title}</h2>
            <ul>
              {phase.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        ))}
      </section>
    </main>
  )
}
