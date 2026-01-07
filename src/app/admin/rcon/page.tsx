'use client'

import { useState } from 'react'
import { adminPost } from '@/lib/adminFetch'
import { useToast } from '@/context/ToastContext'

// Terminal Icon
const TerminalIcon = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="4 17 10 11 4 5" />
    <line x1="12" y1="19" x2="20" y2="19" />
  </svg>
)

// Play Icon
const PlayIcon = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
)

// Server Icon
const ServerIcon = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
    <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
    <line x1="6" y1="6" x2="6.01" y2="6" />
    <line x1="6" y1="18" x2="6.01" y2="18" />
  </svg>
)

interface CommandLog {
  id: number
  command: string
  response: string
  success: boolean
  timestamp: Date
}

export default function RconTestPage() {
  const [command, setCommand] = useState('')
  const [playerName, setPlayerName] = useState('')
  const [loading, setLoading] = useState(false)
  const [logs, setLogs] = useState<CommandLog[]>([])
  const { success, error: toastError } = useToast()

  const executeCommand = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!command.trim()) return

    setLoading(true)
    const cmdToSend = command.startsWith('/') ? command.slice(1) : command
    const finalCommand = playerName.trim() 
      ? cmdToSend.replace(/\{player\}/gi, playerName.trim())
      : cmdToSend

    try {
      const res = await adminPost('/api/rcon/execute', {
        playerName: playerName.trim() || '_CONSOLE_',
        commands: [finalCommand],
        adminOverride: true,
      })

      const data = await res.json()

      const logEntry: CommandLog = {
        id: Date.now(),
        command: finalCommand,
        response: data.results?.[0] || data.error || 'No response',
        success: data.success,
        timestamp: new Date(),
      }

      setLogs(prev => [logEntry, ...prev])

      if (data.success) {
        success('ส่งคำสั่งสำเร็จ')
      } else {
        toastError(data.error || 'คำสั่งล้มเหลว')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'เชื่อมต่อล้มเหลว'
      const logEntry: CommandLog = {
        id: Date.now(),
        command: finalCommand,
        response: errorMessage,
        success: false,
        timestamp: new Date(),
      }
      setLogs(prev => [logEntry, ...prev])
      toastError(errorMessage)
    } finally {
      setLoading(false)
      setCommand('')
    }
  }

  const quickCommands = [
    { label: 'List Players', cmd: 'list' },
    { label: 'Time Day', cmd: 'time set day' },
    { label: 'Weather Clear', cmd: 'weather clear' },
    { label: 'Test Seen', cmd: 'seen {player}' },
  ]

  return (
    <div>
      <h1 className="admin-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <TerminalIcon size={24} />
        RCON Console
      </h1>

      {/* Connection Status */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <ServerIcon size={20} />
          <span>Minecraft Server RCON</span>
          <span style={{ 
            marginLeft: 'auto',
            padding: '0.25rem 0.75rem',
            borderRadius: '9999px',
            fontSize: '0.75rem',
            fontWeight: 500,
            background: 'rgba(34, 197, 94, 0.1)',
            color: '#22c55e',
          }}>
            Ready
          </span>
        </div>
      </div>

      {/* Command Input */}
      <form onSubmit={executeCommand} className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ marginBottom: '1rem' }}>
          <label className="form-label">Player Name (optional)</label>
          <input
            type="text"
            className="input"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="ชื่อผู้เล่น เช่น Loma0531"
          />
          <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginTop: '0.25rem' }}>
            ใช้แทน {'{player}'} ในคำสั่ง
          </p>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label className="form-label">Command</label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ color: 'var(--muted-foreground)', fontFamily: 'monospace', fontWeight: 'bold' }}>/</span>
              <input
                type="text"
                className="input"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="list"
                style={{ fontFamily: 'monospace', flex: 1 }}
                disabled={loading}
              />
            </div>
            <button 
              type="submit" 
              className="btn btn-primary"
              disabled={loading || !command.trim()}
            >
              {loading ? (
                <div className="spinner" style={{ width: 16, height: 16 }} />
              ) : (
                <>
                  <PlayIcon size={14} />
                  Execute
                </>
              )}
            </button>
          </div>
        </div>

        {/* Quick Commands */}
        <div>
          <label className="form-label" style={{ marginBottom: '0.5rem' }}>Quick Commands</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {quickCommands.map((qc) => (
              <button
                key={qc.cmd}
                type="button"
                className="btn btn-sm btn-outline"
                onClick={() => setCommand(qc.cmd)}
              >
                {qc.label}
              </button>
            ))}
          </div>
        </div>
      </form>

      {/* Command Logs */}
      <div className="card">
        <h3 style={{ 
          fontSize: '0.875rem', 
          fontWeight: 600, 
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}>
          <TerminalIcon size={16} />
          Command History
        </h3>

        {logs.length === 0 ? (
          <div style={{ 
            textAlign: 'center', 
            padding: '2rem',
            color: 'var(--muted-foreground)',
          }}>
            No commands executed yet
          </div>
        ) : (
          <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '0.5rem',
            maxHeight: '400px',
            overflowY: 'auto',
          }}>
            {logs.map((log) => (
              <div 
                key={log.id}
                style={{
                  background: log.success ? 'rgba(34, 197, 94, 0.05)' : 'rgba(239, 68, 68, 0.05)',
                  border: `1px solid ${log.success ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                  borderRadius: '0.5rem',
                  padding: '0.75rem',
                  fontFamily: 'monospace',
                  fontSize: '0.8125rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                  <span style={{ color: log.success ? '#22c55e' : '#ef4444', fontWeight: 500 }}>
                    /{log.command}
                  </span>
                  <span style={{ color: 'var(--muted-foreground)', fontSize: '0.75rem' }}>
                    {log.timestamp.toLocaleTimeString('th-TH')}
                  </span>
                </div>
                <div style={{ color: 'var(--foreground)', whiteSpace: 'pre-wrap' }}>
                  {log.response || '(no output)'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <style jsx>{`
        .form-label {
          display: block;
          font-size: 0.8125rem;
          font-weight: 500;
          margin-bottom: 0.5rem;
          color: var(--muted-foreground);
        }
      `}</style>
    </div>
  )
}
