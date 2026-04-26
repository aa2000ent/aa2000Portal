import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { fetchAnnouncementsByType, type AnnouncementItem } from '../api/announcements'

function sortNewestFirst(list: AnnouncementItem[]): AnnouncementItem[] {
  return [...list].sort((a, b) => {
    const at = new Date(a.Date || 0).getTime()
    const bt = new Date(b.Date || 0).getTime()
    return bt - at
  })
}

function getRelativeOffset(index: number, activeIndex: number, total: number): number {
  if (total <= 1) return 0
  const raw = index - activeIndex
  const half = Math.floor(total / 2)
  if (raw > half) return raw - total
  if (raw < -half) return raw + total
  return raw
}

function formatDateLabel(value?: string): string {
  if (!value) return 'No date'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No date'
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function ActiveAnnouncementsCard() {
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([])
  const [memos, setMemos] = useState<AnnouncementItem[]>([])
  const [slideIndex, setSlideIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedItem, setSelectedItem] = useState<AnnouncementItem | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      setError(null)
      try {
        const [announcementList, memoList] = await Promise.all([
          fetchAnnouncementsByType('ANNOUNCEMENT'),
          fetchAnnouncementsByType('MEMO'),
        ])
        if (cancelled) return
        setAnnouncements(sortNewestFirst(announcementList).filter((x) => x.Status === 'ACTIVE'))
        setMemos(sortNewestFirst(memoList).filter((x) => x.Status === 'ACTIVE'))
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Failed to load active announcements.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const activeItems = useMemo(
    () => sortNewestFirst([...announcements, ...memos]).filter((x) => x.Status === 'ACTIVE'),
    [announcements, memos]
  )
  const hasData = activeItems.length > 0
  const visibleCards = useMemo(
    () =>
      activeItems
        .map((item, index) => {
          const offset = getRelativeOffset(index, slideIndex, activeItems.length)
          return { item, index, offset }
        })
        .filter((x) => Math.abs(x.offset) <= 2)
        .sort((a, b) => Math.abs(b.offset) - Math.abs(a.offset)),
    [activeItems, slideIndex]
  )

  useEffect(() => {
    setSlideIndex(0)
  }, [announcements.length, memos.length])

  useEffect(() => {
    if (activeItems.length <= 1) return
    const timer = window.setInterval(() => {
      setSlideIndex((prev) => (prev + 1) % activeItems.length)
    }, 5000)
    return () => window.clearInterval(timer)
  }, [activeItems])

  useEffect(() => {
    if (!selectedItem) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedItem(null)
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [selectedItem])

  return (
    <>
      <section className="dashboard-announcement-showcase" aria-label="Active announcements slideshow">
        <h2 className="dashboard-announcement-showcase__title">ANNOUNCEMENTS</h2>
        <div className="dashboard-graph-wrap">
          {loading ? (
            <div className="dashboard-graph-empty">Loading active announcements...</div>
          ) : error ? (
            <div className="dashboard-graph-empty">{error}</div>
          ) : !hasData ? (
            <div className="dashboard-graph-empty">No active announcements or memos found.</div>
          ) : (
            <div className="dashboard-announcement-slider">
              {visibleCards.map(({ item, index, offset }) => (
                <article
                  key={`announcement-card-${item.an_ID}-${index}`}
                  className={`dashboard-announcement-slide ${offset === 0 ? 'is-active' : ''}`}
                  style={
                    {
                      ['--offset' as string]: offset,
                      ['--abs-offset' as string]: Math.abs(offset),
                    } as CSSProperties
                  }
                  aria-hidden={offset !== 0}
                >
                  <button
                    type="button"
                    className={`dashboard-announcement-slide__button ${offset === 0 ? 'is-primary' : ''}`}
                    onClick={() => setSelectedItem(item)}
                    aria-label={`Open announcement: ${item.Title || 'Untitled'}`}
                  >
                    {item.Image ? (
                      <img
                        src={item.Image}
                        alt={item.Title}
                        className="dashboard-announcement-slide__image"
                      />
                    ) : (
                      <div className="dashboard-announcement-slide__image dashboard-announcement-slide__image--placeholder">
                        No image
                      </div>
                    )}
                    <h3 className="dashboard-announcement-slide__title">{item.Title || 'Untitled'}</h3>
                    <p className="dashboard-announcement-slide__desc">{item.Description || 'No description.'}</p>
                    <div className="dashboard-announcement-slide__footer">
                      <p className="dashboard-announcement-slide__meta">{item.type === 'MEMO' ? 'MEMO' : 'PUBLIC ANNOUNCEMENT'}</p>
                      <p className="dashboard-announcement-slide__date">{formatDateLabel(item.Date)}</p>
                    </div>
                  </button>
                </article>
              ))}

              <div className="dashboard-announcement-slider__controls">
                <button
                  type="button"
                  className="employees-pagination-btn"
                  onClick={() => setSlideIndex((prev) => (prev - 1 + activeItems.length) % activeItems.length)}
                  disabled={activeItems.length <= 1}
                >
                  Prev
                </button>
                <div className="dashboard-announcement-slider__dots">
                  {activeItems.map((_, idx) => (
                    <button
                      key={`carousel-dot-${idx}`}
                      type="button"
                      onClick={() => setSlideIndex(idx)}
                      className={`dashboard-announcement-slider__dot ${slideIndex === idx ? 'is-active' : ''}`}
                      aria-label={`Go to slide ${idx + 1}`}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  className="employees-pagination-btn"
                  onClick={() => setSlideIndex((prev) => (prev + 1) % activeItems.length)}
                  disabled={activeItems.length <= 1}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
      {selectedItem && (
        <div className="dashboard-announcement-dialog-backdrop" role="presentation" onClick={() => setSelectedItem(null)}>
          <div
            className="dashboard-announcement-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={selectedItem.Title || 'Announcement details'}
            onClick={(event) => event.stopPropagation()}
          >
            <p className="dashboard-announcement-dialog__eyebrow">
              {selectedItem.type === 'MEMO' ? 'Internal memo' : 'Public announcement'}
            </p>
            <button
              type="button"
              className="dashboard-announcement-dialog__close"
              onClick={() => setSelectedItem(null)}
              aria-label="Close announcement dialog"
            >
              ×
            </button>
            {selectedItem.Image ? (
              <img
                src={selectedItem.Image}
                alt={selectedItem.Title}
                className="dashboard-announcement-dialog__image"
              />
            ) : (
              <div className="dashboard-announcement-dialog__image dashboard-announcement-dialog__image--placeholder">
                No image
              </div>
            )}
            <h3 className="dashboard-announcement-dialog__title">{selectedItem.Title || 'Untitled'}</h3>
            <p className="dashboard-announcement-dialog__meta">
              Posted on {formatDateLabel(selectedItem.Date)}
            </p>
            <p className="dashboard-announcement-dialog__description">
              {selectedItem.Description || 'No description.'}
            </p>
          </div>
        </div>
      )}
    </>
  )
}

