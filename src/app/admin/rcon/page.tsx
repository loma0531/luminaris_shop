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
      <h1 className="admin-title flex items-center gap-2 mb-6">
        <TerminalIcon size={24} />
        RCON Console
      </h1>

      {/* Connection Status */}
      <div className="card mb-6">
        <div className="flex items-center gap-3">
          <ServerIcon size={20} />
          <span>Minecraft Server RCON</span>
          <span className="ml-auto px-3 py-1 rounded-full text-xs font-medium bg-success/10 text-success">
            Ready
          </span>
        </div>
      </div>

      {/* Command Input */}
      <form onSubmit={executeCommand} className="card mb-6">
        <div className="mb-4">
          <label className="form-label">Player Name (optional)</label>
          <input
            type="text"
            className="input"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="ชื่อผู้เล่น เช่น Loma0531"
          />
          <p className="text-xs text-muted-foreground mt-1">
            ใช้แทน {'{player}'} ในคำสั่ง
          </p>
        </div>

        <div className="mb-4">
          <label className="form-label">Command</label>
          <div className="flex gap-2">
            <div className="flex-1 flex items-center gap-2">
              <span className="text-muted-foreground font-mono font-bold">/</span>
              <input
                type="text"
                className="input font-mono flex-1"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="list"
                disabled={loading}
              />
            </div>
            <button 
              type="submit" 
              className="btn btn-primary"
              disabled={loading || !command.trim()}
            >
              {loading ? (
                <div className="spinner w-4 h-4" />
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
          <label className="form-label mb-2">Quick Commands</label>
          <div className="flex flex-wrap gap-2">
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
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <TerminalIcon size={16} />
          Command History
        </h3>

        {logs.length === 0 ? (
          <div className="text-center p-8 text-muted-foreground">
            No commands executed yet
          </div>
        ) : (
          <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto">
            {logs.map((log) => (
              <div 
                key={log.id}
                className={`rounded-lg p-3 font-mono text-[0.8125rem] border ${log.success ? 'bg-success/5 border-success/20' : 'bg-error/5 border-error/20'}`}
              >
                <div className="flex justify-between mb-1">
                  <span className={`font-medium ${log.success ? 'text-success' : 'text-error'}`}>
                    /{log.command}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {log.timestamp.toLocaleTimeString('th-TH')}
                  </span>
                </div>
                <div className="text-foreground whitespace-pre-wrap">
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
