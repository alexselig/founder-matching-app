import { useEffect, useId, useRef } from 'react'

import { useDialogFocus } from './useDialogFocus'
import type { DinnerExportFile } from './dinnerExport'

export type ExportStage = 'options' | 'progress' | 'success' | 'failure'

export interface DinnerExportDialogProps {
  readonly planName: string
  readonly founderCount: number
  readonly dimensions: string
  readonly includeDetails: boolean
  readonly stage: ExportStage
  readonly file: DinnerExportFile | null
  readonly onIncludeDetailsChange: (value: boolean) => void
  readonly onExport: () => void
  readonly onCancelExport: () => void
  readonly onReview: () => void
  readonly onDownload: () => void
  readonly onClose: () => void
}

const HEADS: Record<ExportStage, { eyebrow: string; title: string; text: string; close: string }> = {
  options: {
    eyebrow: 'Confirm export',
    title: 'Confirm the current view.',
    text: 'Check the view and decide whether to include the available founder details.',
    close: 'Close export options',
  },
  progress: { eyebrow: 'Export in progress', title: 'Preparing your CSV.', text: '', close: 'Close export progress' },
  success: {
    eyebrow: 'Export complete',
    title: 'Your file is ready.',
    text: 'The export completed without changing the current Search or dinner plan.',
    close: 'Close export success',
  },
  failure: {
    eyebrow: 'Export failed',
    title: "We couldn't create the file.",
    text: 'Your current view and founder-detail selection are still intact.',
    close: 'Close export failure',
  },
}

export function DinnerExportDialog(props: DinnerExportDialogProps) {
  const { stage, founderCount, includeDetails, planName } = props
  const titleId = useId()
  const detailsId = useId()
  const primaryRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useDialogFocus<HTMLElement>(true, props.onClose, primaryRef)
  const firstStage = useRef(true)
  const head = HEADS[stage]
  const scope = `Seating plan · ${planName}`
  const detailCopy = `${founderCount} founders · ${includeDetails ? 'founder details included' : 'core identity fields only'}`

  useEffect(() => {
    if (firstStage.current) {
      firstStage.current = false
      return
    }
    primaryRef.current?.focus()
  }, [stage])

  return (
    <div className="v2-export-stage">
      <section ref={dialogRef} className="v2-export-export-panel" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="v2-export-panel-head">
          <div>
            <span className="v2-export-eyebrow">{head.eyebrow}</span>
            <h2 id={titleId}>{head.title}</h2>
            <p>{stage === 'progress' ? `${planName} · ${founderCount} founders` : head.text}</p>
          </div>
          <button type="button" className="v2-export-close" aria-label={head.close} onClick={props.onClose}>
            ×
          </button>
        </div>

        {stage === 'options' && (
          <>
            <div className="v2-export-panel-body">
              <div className="v2-export-section-heading">
                <strong>Current view</strong>
                <span>Exported as shown</span>
              </div>
              <div className="v2-export-current-view-summary">
                <strong>{scope}</strong>
                <div className="v2-export-context-stats">
                  <div>
                    <small>Founders</small>
                    <strong>{founderCount} seated</strong>
                  </div>
                  <div>
                    <small>Order</small>
                    <strong>Table order</strong>
                  </div>
                  <div>
                    <small>Dimensions</small>
                    <strong>{props.dimensions}</strong>
                  </div>
                </div>
              </div>
              <div className="v2-export-section-heading">
                <strong>File contents</strong>
                <span>CSV only</span>
              </div>
              <div className="v2-export-option-row">
                <label className="v2-export-detail-option">
                  <input
                    type="checkbox"
                    checked={includeDetails}
                    aria-describedby={detailsId}
                    onChange={(event) => props.onIncludeDetailsChange(event.target.checked)}
                  />
                  <strong>Include founder details</strong>
                  <span id={detailsId}>
                    {includeDetails
                      ? 'Adds company, role, age, education, cohort group, and cohort section.'
                      : 'Exports table, seat, founder ID, name, and fit scores only.'}
                  </span>
                </label>
                <div className="v2-export-format">
                  <small>Format</small>
                  <strong>CSV</strong>
                </div>
              </div>
              <div className="v2-export-privacy-note">
                <strong>Privacy check</strong>
                This file contains founder information intended for event planning. Share only with people who are permitted to use the source
                dataset. Web Search evidence and provider credentials are not included.
              </div>
            </div>
            <div className="v2-export-panel-actions">
              <button type="button" onClick={props.onClose}>
                Cancel
              </button>
              <button ref={primaryRef} type="button" className="v2-export-primary" onClick={props.onExport}>
                Export CSV →
              </button>
            </div>
          </>
        )}

        {stage === 'progress' && (
          <>
            <div className="v2-export-state-body" aria-live="polite">
              <div className="v2-export-state-mark" aria-hidden="true">
                ↗
              </div>
              <h2>Building the export.</h2>
              <p>The seating plan and founder details are being assembled. You can leave this panel open while the file is prepared.</p>
              <div className="v2-export-progress-track" role="progressbar" aria-label="Export generation in progress">
                <span />
              </div>
              <div className="v2-export-progress-meta">
                <strong>Generating file…</strong>
                <span>No percentage available yet</span>
              </div>
            </div>
            <div className="v2-export-panel-actions">
              <button ref={primaryRef} type="button" onClick={props.onCancelExport}>
                Cancel export
              </button>
            </div>
          </>
        )}

        {stage === 'success' && (
          <>
            <div className="v2-export-state-body" aria-live="polite">
              <div className="v2-export-state-mark v2-export-success" aria-hidden="true">
                ✓
              </div>
              <h2>Export complete.</h2>
              <p>Download the CSV now. You can return to the app and keep working with the same selections.</p>
              <div className="v2-export-file-card">
                <span className="v2-export-file-icon">CSV</span>
                <span>
                  <strong>{props.file?.filename}</strong>
                  <small>{detailCopy}</small>
                </span>
                <span>Ready</span>
              </div>
            </div>
            <div className="v2-export-panel-actions">
              <button type="button" onClick={props.onReview}>
                Export another
              </button>
              <button ref={primaryRef} type="button" className="v2-export-primary" onClick={props.onDownload}>
                Download CSV ↓
              </button>
            </div>
          </>
        )}

        {stage === 'failure' && (
          <>
            <div className="v2-export-state-body" aria-live="polite">
              <div className="v2-export-state-mark v2-export-failure" aria-hidden="true">
                !
              </div>
              <h2>Nothing was downloaded.</h2>
              <p>The file could not be prepared. No partial file was created and your current work was not changed.</p>
              <div className="v2-export-error-detail">
                <strong>Export service unavailable.</strong>
                <br />
                Check your connection, then retry with the same selections.
              </div>
              <div className="v2-export-preserved">
                <span>
                  <strong>{scope} · CSV</strong>
                  <span>{detailCopy}</span>
                </span>
                <span>Selections preserved</span>
              </div>
            </div>
            <div className="v2-export-panel-actions">
              <button type="button" onClick={props.onReview}>
                Review details
              </button>
              <button ref={primaryRef} type="button" className="v2-export-primary" onClick={props.onExport}>
                Retry export →
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
