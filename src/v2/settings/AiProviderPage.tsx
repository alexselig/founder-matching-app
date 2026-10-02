import { useMemo, useState } from 'react'

import type { Founder } from '../../shared/founder'
import {
  PROVIDER_LABELS,
  type ProviderCredentialList,
  type ProviderId,
} from '../../shared/providerContracts'
import {
  deleteProviderCredential,
  saveProviderCredential,
} from '../api'
import { V2Footer } from '../layout/V2Footer'
import { V2Header } from '../layout/V2Header'
import {
  browserLocalStorage,
  readAccountRole,
  readCurrentFounderId,
  writeAccountRole,
  type AccountRole,
} from '../search/accountState'
import './ai-provider.css'

const PROVIDERS: readonly ProviderId[] = ['openai', 'anthropic', 'xai']

const COPY: Readonly<Record<ProviderId, string>> = {
  openai: 'Intent parsing, reranking, and web search with citations.',
  anthropic: 'Intent parsing, dinner criteria, and cited web search.',
  xai: 'Intent parsing, reranking, and web search with citations.',
}

const MODELS: Readonly<Record<ProviderId, readonly string[]>> = {
  openai: ['GPT-5', 'GPT-5 mini'],
  anthropic: ['Claude Opus 4.8'],
  xai: ['Grok 4', 'Grok 4 Fast'],
}

type ValidationState = 'setup' | 'validating' | 'valid' | 'invalid'

export interface AiProviderPageProps {
  founders: readonly Founder[]
  credentials: ProviderCredentialList
  demoMode?: boolean
}

export function AiProviderPage({
  founders,
  credentials,
  demoMode = false,
}: AiProviderPageProps) {
  const initial =
    credentials.providers.find((item) => item.status === 'valid')?.provider ??
    'anthropic'
  const [provider, setProvider] = useState<ProviderId>(initial)
  const [secret, setSecret] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [state, setState] = useState<ValidationState>(
    credentials.providers.some(
      (item) => item.provider === initial && item.status === 'valid',
    )
      ? 'valid'
      : 'setup',
  )
  const [statuses, setStatuses] = useState(credentials.providers)
  const [message, setMessage] = useState('')
  const [role, setRole] = useState<AccountRole>(() =>
    readAccountRole(browserLocalStorage()),
  )
  const [currentFounderId] = useState(() =>
    readCurrentFounderId(browserLocalStorage(), founders),
  )
  const currentFounder =
    founders.find((founder) => founder.id === currentFounderId) ?? null
  const status = useMemo(
    () => statuses.find((item) => item.provider === provider)!,
    [provider, statuses],
  )

  function changeRole(next: AccountRole) {
    setRole(next)
    writeAccountRole(browserLocalStorage(), next)
  }

  function choose(next: ProviderId) {
    setProvider(next)
    setSecret('')
    setState(
      statuses.find((item) => item.provider === next)?.status === 'valid'
        ? 'valid'
        : 'setup',
    )
  }

  async function validate() {
    if (!secret.trim() && !demoMode) return
    setState('validating')
    setMessage('Validating credential with the selected provider')
    try {
      const next = demoMode
        ? {
            provider,
            label: PROVIDER_LABELS[provider],
            status: 'valid' as const,
            lastFour: 'DEMO',
            validatedAt: new Date().toISOString(),
          }
        : await saveProviderCredential(provider, secret)
      setStatuses((current) =>
        current.map((item) => (item.provider === provider ? next : item)),
      )
      setSecret('')
      setState('valid')
      setMessage(`${PROVIDER_LABELS[provider]} credential validated`)
    } catch (error) {
      setState('invalid')
      setMessage(
        error instanceof Error
          ? error.message
          : 'Credential validation failed',
      )
    }
  }

  async function remove() {
    if (demoMode) {
      setStatuses((current) =>
        current.map((item) =>
          item.provider === provider
            ? { ...item, status: 'not_configured', lastFour: null, validatedAt: null }
            : item,
        ),
      )
    } else {
      const next = await deleteProviderCredential(provider)
      setStatuses((current) =>
        current.map((item) => (item.provider === provider ? next : item)),
      )
    }
    setState('setup')
    setMessage(`${PROVIDER_LABELS[provider]} credential removed`)
  }

  if (role !== 'admin') {
    return (
      <div className="v2-shell">
        <V2Header
          active="table-config"
          role={role}
          currentFounder={currentFounder}
          onRoleChange={changeRole}
        />
        <main className="v2-ai-restricted">
          <h1>AI configuration is for YC admins.</h1>
          <p>Switch to a YC Admin account to manage provider credentials.</p>
        </main>
        <V2Footer role={role} />
      </div>
    )
  }

  const valid = state === 'valid'
  const invalid = state === 'invalid'
  const validating = state === 'validating'
  return (
    <div className="v2-shell v2-ai-shell">
      <V2Header
        active="table-config"
        role={role}
        currentFounder={currentFounder}
        onRoleChange={changeRole}
      />
      <main>
        <section className="v2-ai-page-head">
          <div className="v2-ai-title-block">
            <span>Table Config / AI</span>
            <h1>AI Provider</h1>
            <p>
              Connect one provider for AI-assisted search, dinner criteria,
              reranking, and cited web evidence.
            </p>
          </div>
          <div className="v2-ai-head-copy">
            <span>Admin-only configuration</span>
            <h2>Bring your own credential</h2>
            <p>
              Choose a provider and model, then validate its credential. Basic
              Search and deterministic dinner matching remain available when
              AI is disabled.
            </p>
          </div>
        </section>
        <section className="v2-ai-workspace">
          <div className="v2-ai-config">
            <span className="v2-ai-kicker">1 · Provider</span>
            <h2>Select a provider</h2>
            <div className="v2-ai-provider-grid" role="group" aria-label="AI provider">
              {PROVIDERS.map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={provider === item}
                  onClick={() => choose(item)}
                >
                  <span>
                    <strong>{PROVIDER_LABELS[item]}</strong>
                    <i>{provider === item ? '✓' : ''}</i>
                  </span>
                  <small>{COPY[item]}</small>
                </button>
              ))}
            </div>
            <div className="v2-ai-form-row">
              <label>
                <span>Model · {PROVIDER_LABELS[provider]}</span>
                <select>
                  {MODELS[provider].map((model) => (
                    <option key={model}>{model}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>API credential · Required to enable AI</span>
                <span className="v2-ai-secret">
                  <input
                    type={showSecret ? 'text' : 'password'}
                    value={secret}
                    autoComplete="new-password"
                    placeholder={status.lastFour ? `Stored ···· ${status.lastFour}` : 'Paste provider credential'}
                    onChange={(event) => setSecret(event.target.value)}
                  />
                  <button type="button" onClick={() => setShowSecret((shown) => !shown)}>
                    {showSecret ? 'Hide' : 'Show'}
                  </button>
                </span>
              </label>
            </div>
            <section className={invalid ? 'v2-ai-validation v2-ai-invalid' : 'v2-ai-validation'}>
              <div className="v2-ai-validation-head">
                <div className="v2-ai-status-icon">
                  {valid ? '✓' : invalid ? '!' : validating ? '…' : '+'}
                </div>
                <div>
                  <strong>
                    {valid
                      ? 'Credential is valid'
                      : invalid
                        ? 'Credential could not be validated'
                        : validating
                          ? 'Validating credential'
                          : 'Ready to validate'}
                  </strong>
                  <p>
                    {valid
                      ? 'AI features are enabled. Only encrypted credential data and redacted metadata are retained.'
                      : invalid
                        ? message
                        : validating
                          ? 'Checking provider access and model availability. No raw credential is written to storage yet.'
                          : 'The credential has not been sent. Validate it before enabling AI features.'}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={validating || (!secret.trim() && !demoMode)}
                  onClick={() => void validate()}
                >
                  {validating ? 'Validating…' : valid ? 'Validate again' : 'Validate credential'}
                </button>
              </div>
              {valid && (
                <div className="v2-ai-valid-meta">
                  <div><small>Provider</small><strong>{PROVIDER_LABELS[provider]}</strong></div>
                  <div><small>Credential</small><strong>Ending in ···· {status.lastFour}</strong></div>
                  <div><small>Validated</small><strong>{demoMode ? 'Demo state' : 'Stored securely'}</strong></div>
                  <button type="button" onClick={() => void remove()}>Remove</button>
                </div>
              )}
            </section>
          </div>
          <aside className="v2-ai-security">
            <span className="v2-ai-kicker">2 · Security boundary</span>
            <h2>What leaves the browser</h2>
            <ol>
              <li><b>1</b><span><strong>Submitted directly to the server</strong>The credential is never written to browser storage.</span></li>
              <li><b>2</b><span><strong>Validated with the selected provider</strong>The server checks access before saving it.</span></li>
              <li><b>3</b><span><strong>Encrypted before local storage</strong>AES-256-GCM ciphertext is stored in SQLite.</span></li>
            </ol>
            <p>Basic Search and deterministic dinner matching work without AI.</p>
          </aside>
        </section>
      </main>
      <V2Footer
        role={role}
        aiStatus={valid ? `✓ AI Enabled · ${PROVIDER_LABELS[provider]}` : invalid ? '⚠ AI Connection Issue' : '+ AI Disabled'}
        aiTone={valid ? 'enabled' : invalid ? 'issue' : 'off'}
      />
      <div className="v2-visually-hidden" role="status" aria-live="polite">{message}</div>
    </div>
  )
}
