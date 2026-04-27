import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  createAnnouncement,
  fetchAnnouncementsByType,
  type AnnouncementItem,
  type AnnouncementType,
} from '../api/announcements'
import { getPortalAccountId } from '../api/client'

type StoryReaction = 'like' | 'love' | 'fire' | 'clap'
type StoryReactionMap = Record<string, StoryReaction>
type StoryViewedMap = Record<string, boolean>

const STORY_REACTIONS: Array<{ key: StoryReaction; emoji: string; label: string }> = [
  { key: 'like', emoji: '👍', label: 'Like' },
  { key: 'love', emoji: '❤️', label: 'Love' },
  { key: 'fire', emoji: '🔥', label: 'Fire' },
  { key: 'clap', emoji: '👏', label: 'Clap' },
]

const STORY_REACTION_STORAGE_KEY = 'aa2000.storyReactions'
const STORY_VIEWED_STORAGE_KEY = 'aa2000.storyViewed'
const STORY_CREATOR_SEGMENTS = new Set(['admin', 'ceo', 'general-manager'])

function sortNewestFirst(list: AnnouncementItem[]): AnnouncementItem[] {
  return [...list].sort((a, b) => {
    const at = new Date(a.Date || 0).getTime()
    const bt = new Date(b.Date || 0).getTime()
    return bt - at
  })
}

function formatDateLabel(value?: string): string {
  if (!value) return 'No date'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No date'
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function storyAuthorLabel(item: AnnouncementItem): string {
  if (item.authorName?.trim()) return item.authorName.trim()
  if (item.acc_ID > 0) return `User ${item.acc_ID}`
  return 'Unknown user'
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('Failed to read image file.'))
    reader.readAsDataURL(file)
  })
}

export default function DashboardStories() {
  const location = useLocation()
  const [items, setItems] = useState<AnnouncementItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [reactions, setReactions] = useState<StoryReactionMap>({})
  const [viewedStories, setViewedStories] = useState<StoryViewedMap>({})
  const [openComposer, setOpenComposer] = useState(false)
  const [composerType, setComposerType] = useState<AnnouncementType>('ANNOUNCEMENT')
  const [composerImage, setComposerImage] = useState('')
  const [composerText, setComposerText] = useState('')
  const [composerMode, setComposerMode] = useState<'gallery' | 'editor'>('gallery')
  const [composerShowTextInput, setComposerShowTextInput] = useState(false)
  const [composerTextPos, setComposerTextPos] = useState({ x: 46, y: 60 })
  const [composerDragging, setComposerDragging] = useState(false)
  const [composerCustomImage, setComposerCustomImage] = useState('')
  const [composerError, setComposerError] = useState<string | null>(null)
  const [composerBusy, setComposerBusy] = useState(false)
  const composerPreviewRef = useRef<HTMLDivElement | null>(null)
  const composerTextRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{
    startX: number
    startY: number
    baseX: number
    baseY: number
    maxX: number
    maxY: number
  } | null>(null)

  const loadStories = async () => {
    setLoading(true)
    setError(null)
    try {
      const [announcementList, memoList] = await Promise.all([
        fetchAnnouncementsByType('ANNOUNCEMENT'),
        fetchAnnouncementsByType('MEMO'),
      ])
      const merged = sortNewestFirst([...announcementList, ...memoList]).filter((x) => x.Status === 'ACTIVE')
      setItems(merged.slice(0, 12))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load stories.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORY_REACTION_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as StoryReactionMap
      if (parsed && typeof parsed === 'object') setReactions(parsed)
    } catch {
      // Ignore malformed local storage values.
    }
  }, [])

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORY_VIEWED_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as StoryViewedMap
      if (parsed && typeof parsed === 'object') setViewedStories(parsed)
    } catch {
      // Ignore malformed local storage values.
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem(STORY_REACTION_STORAGE_KEY, JSON.stringify(reactions))
  }, [reactions])

  useEffect(() => {
    window.localStorage.setItem(STORY_VIEWED_STORAGE_KEY, JSON.stringify(viewedStories))
  }, [viewedStories])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (cancelled) return
      await loadStories()
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (selectedIndex === null) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedIndex(null)
      } else if (event.key === 'ArrowRight' && items.length > 0) {
        setSelectedIndex((prev) => (prev === null ? 0 : (prev + 1) % items.length))
      } else if (event.key === 'ArrowLeft' && items.length > 0) {
        setSelectedIndex((prev) => (prev === null ? 0 : (prev - 1 + items.length) % items.length))
      }
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [selectedIndex, items.length])

  useEffect(() => {
    if (selectedIndex === null) return
    const selectedItem = items[selectedIndex]
    if (!selectedItem) return
    const key = String(selectedItem.an_ID)
    setViewedStories((prev) => (prev[key] ? prev : { ...prev, [key]: true }))
  }, [selectedIndex, items])

  const hasItems = useMemo(() => items.length > 0, [items])
  const firstPathSegment = useMemo(() => location.pathname.split('/').filter(Boolean)[0] ?? '', [location.pathname])
  const canCreateStories = useMemo(() => STORY_CREATOR_SEGMENTS.has(firstPathSegment), [firstPathSegment])
  const isStoryViewed = (id: number): boolean => Boolean(viewedStories[String(id)])
  const railItems = useMemo(() => {
    const unseen = items.filter((item) => !isStoryViewed(item.an_ID))
    const seen = items.filter((item) => isStoryViewed(item.an_ID))
    return [...unseen, ...seen]
  }, [items, viewedStories])

  const handleAddStory = () => {
    if (!canCreateStories) return
    setSelectedIndex(null)
    setComposerType(firstPathSegment === 'admin' ? 'ANNOUNCEMENT' : 'MEMO')
    setComposerImage('')
    setComposerMode('gallery')
    setComposerShowTextInput(false)
    setComposerCustomImage('')
    setComposerText('')
    setComposerTextPos({ x: 46, y: 60 })
    setComposerError(null)
    setOpenComposer(true)
  }

  const selected = selectedIndex !== null ? items[selectedIndex] ?? null : null
  const selectedReaction = selected ? reactions[String(selected.an_ID)] : undefined

  const toggleReaction = (storyId: string, reaction: StoryReaction) => {
    setReactions((prev) => {
      if (prev[storyId] === reaction) {
        const next = { ...prev }
        delete next[storyId]
        return next
      }
      return { ...prev, [storyId]: reaction }
    })
  }

  const closeComposer = () => {
    if (composerBusy) return
    setOpenComposer(false)
  }

  const composerGallery = useMemo(() => {
    const uniq = new Set<string>()
    const result: string[] = []
    if (composerCustomImage) {
      uniq.add(composerCustomImage)
      result.push(composerCustomImage)
    }
    for (const item of items) {
      if (!item.Image) continue
      if (uniq.has(item.Image)) continue
      uniq.add(item.Image)
      result.push(item.Image)
    }
    return result
  }, [composerCustomImage, items])

  const beginComposerTextDrag = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!composerPreviewRef.current || !composerTextRef.current) return
    const previewRect = composerPreviewRef.current.getBoundingClientRect()
    const textRect = composerTextRef.current.getBoundingClientRect()
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      baseX: composerTextPos.x,
      baseY: composerTextPos.y,
      maxX: Math.max(0, previewRect.width - textRect.width),
      maxY: Math.max(0, previewRect.height - textRect.height),
    }
    setComposerDragging(true)
  }

  useEffect(() => {
    if (!composerDragging) return
    const onMove = (event: MouseEvent) => {
      if (!dragRef.current) return
      const dx = event.clientX - dragRef.current.startX
      const dy = event.clientY - dragRef.current.startY
      const nx = Math.max(0, Math.min(dragRef.current.baseX + dx, dragRef.current.maxX))
      const ny = Math.max(0, Math.min(dragRef.current.baseY + dy, dragRef.current.maxY))
      setComposerTextPos({ x: nx, y: ny })
    }
    const onUp = () => {
      setComposerDragging(false)
      dragRef.current = null
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [composerDragging])

  const handleCreateStory = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!canCreateStories) {
      setComposerError('You are only allowed to view stories.')
      return
    }
    const accId = Number(getPortalAccountId() ?? 0)
    if (!accId) {
      setComposerError('No active portal account found. Please sign in again.')
      return
    }
    if (!composerImage.trim()) {
      setComposerError('Please select or upload a story image.')
      return
    }
    setComposerBusy(true)
    setComposerError(null)
    try {
      const text = composerText.trim()
      const fallbackTitle = `Story ${new Date().toLocaleDateString()}`
      await createAnnouncement({
        acc_ID: accId,
        Title: text || fallbackTitle,
        Description: text || '',
        Image: composerImage.trim(),
        Status: 'ACTIVE',
        type: composerType,
      })
      setOpenComposer(false)
      await loadStories()
    } catch (e) {
      setComposerError(e instanceof Error ? e.message : 'Failed to create story.')
    } finally {
      setComposerBusy(false)
    }
  }

  return (
    <>
      <section className="dashboard-stories" aria-label="Announcement stories">
        <div className="dashboard-stories__head">
          <h2 className="dashboard-stories__title">Stories</h2>
          <span className="dashboard-stories__hint">Latest stories</span>
        </div>
        {loading ? (
          <div className="dashboard-stories__empty">Loading stories...</div>
        ) : error ? (
          <div className="dashboard-stories__empty">{error}</div>
        ) : !hasItems ? (
          <div className="dashboard-stories__rail">
            {canCreateStories && (
              <button type="button" className="dashboard-story dashboard-story--add" onClick={handleAddStory}>
                <span className="dashboard-story__avatar-wrap dashboard-story__avatar-wrap--add">
                  <span className="dashboard-story__avatar dashboard-story__avatar--add">+</span>
                </span>
                <span className="dashboard-story__label">Add story</span>
              </button>
            )}
            <div className="dashboard-stories__empty">No active stories.</div>
          </div>
        ) : (
          <div className="dashboard-stories__rail">
            {canCreateStories && (
              <button type="button" className="dashboard-story dashboard-story--add" onClick={handleAddStory}>
                <span className="dashboard-story__avatar-wrap dashboard-story__avatar-wrap--add">
                  <span className="dashboard-story__avatar dashboard-story__avatar--add">+</span>
                </span>
                <span className="dashboard-story__label">Add story</span>
              </button>
            )}
            {railItems.map((item) => (
              <button
                key={`story-${item.an_ID}`}
                type="button"
                className={`dashboard-story ${isStoryViewed(item.an_ID) ? 'is-seen' : ''}`}
                onClick={() => {
                  const originalIndex = items.findIndex((row) => row.an_ID === item.an_ID)
                  if (originalIndex >= 0) setSelectedIndex(originalIndex)
                }}
                aria-label={`Open story ${item.Title || 'Untitled'}`}
              >
                <span className="dashboard-story__avatar-wrap">
                  {item.Image ? (
                    <img src={item.Image} alt={item.Title || 'Story'} className="dashboard-story__avatar" />
                  ) : (
                    <span className="dashboard-story__avatar dashboard-story__avatar--placeholder">
                      {item.type === 'MEMO' ? 'M' : 'A'}
                    </span>
                  )}
                  <span className="dashboard-story__author">{storyAuthorLabel(item)}</span>
                </span>
                <span className="dashboard-story__label">{item.Title || 'Untitled'}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {selected && (
        <div className="dashboard-announcement-dialog-backdrop" role="presentation" onClick={() => setSelectedIndex(null)}>
          <div className="dashboard-story-viewer" role="dialog" aria-modal="true" aria-label={selected.Title || 'Story details'} onClick={(event) => event.stopPropagation()}>
            <aside className="dashboard-story-viewer__sidebar">
              <div className="dashboard-story-viewer__sidebar-head">
                <h3 className="dashboard-story-viewer__sidebar-title">Stories</h3>
                <button
                  type="button"
                  className="dashboard-announcement-dialog__close"
                  onClick={() => setSelectedIndex(null)}
                  aria-label="Close story dialog"
                >
                  ×
                </button>
              </div>
              {canCreateStories && (
                <button type="button" className="dashboard-story dashboard-story--add dashboard-story--add-sidebar" onClick={handleAddStory}>
                  <span className="dashboard-story__avatar-wrap dashboard-story__avatar-wrap--add">
                    <span className="dashboard-story__avatar dashboard-story__avatar--add">+</span>
                  </span>
                  <span className="dashboard-story__label">Create story</span>
                </button>
              )}
              <div className="dashboard-story-viewer__list">
                {items.map((item, index) => (
                  <button
                    key={`viewer-item-${item.an_ID}`}
                    type="button"
                    className={`dashboard-story-viewer__list-item ${index === selectedIndex ? 'is-active' : ''} ${isStoryViewed(item.an_ID) ? 'is-seen' : ''}`}
                    onClick={() => setSelectedIndex(index)}
                    aria-label={`Open ${item.Title || 'Untitled'} story`}
                  >
                    <span className="dashboard-story-viewer__list-avatar">
                      {item.Image ? <img src={item.Image} alt={item.Title || 'Story'} /> : <span>{item.type === 'MEMO' ? 'M' : 'A'}</span>}
                    </span>
                    <span className="dashboard-story-viewer__list-copy">
                      <strong>{item.Title || 'Untitled'}</strong>
                      <small>{formatDateLabel(item.Date)}</small>
                    </span>
                  </button>
                ))}
              </div>
            </aside>

            <div className="dashboard-story-viewer__stage">
              <button
                type="button"
                className="dashboard-story-viewer__nav dashboard-story-viewer__nav--prev"
                onClick={() => setSelectedIndex((prev) => (prev === null ? 0 : (prev - 1 + items.length) % items.length))}
                aria-label="Previous story"
              >
                ‹
              </button>
              <article className="dashboard-story-viewer__card">
                {selected.Image ? (
                  <img src={selected.Image} alt={selected.Title} className="dashboard-announcement-dialog__image" />
                ) : (
                  <div className="dashboard-announcement-dialog__image dashboard-announcement-dialog__image--placeholder">
                    <div className="dashboard-story-viewer__no-image-copy">
                      <strong>{selected.Title || 'Untitled'}</strong>
                      <p>{selected.Description || 'No image available for this story.'}</p>
                    </div>
                  </div>
                )}
              </article>
              <button
                type="button"
                className="dashboard-story-viewer__nav dashboard-story-viewer__nav--next"
                onClick={() => setSelectedIndex((prev) => (prev === null ? 0 : (prev + 1) % items.length))}
                aria-label="Next story"
              >
                ›
              </button>
              <footer className="dashboard-story-viewer__footer">
                <div className="dashboard-story-viewer__message">Send message...</div>
                <div className="dashboard-story-reactions" aria-label="Story reactions">
                  {STORY_REACTIONS.map((reaction) => {
                    const isActive = selectedReaction === reaction.key
                    return (
                      <button
                        key={reaction.key}
                        type="button"
                        className={`dashboard-story-reaction-btn ${isActive ? 'is-active' : ''}`}
                        onClick={() => toggleReaction(String(selected.an_ID), reaction.key)}
                        aria-label={reaction.label}
                        title={reaction.label}
                      >
                        <span aria-hidden>{reaction.emoji}</span>
                      </button>
                    )
                  })}
                </div>
              </footer>
            </div>
          </div>
        </div>
      )}

      {openComposer && canCreateStories && (
        <div className="modal-overlay dashboard-story-creator-overlay" onClick={closeComposer} role="dialog" aria-modal="true">
          <div className="dashboard-story-creator" onClick={(event) => event.stopPropagation()}>
            <div className="dashboard-story-creator__header">
              <button type="button" className="dashboard-story-creator__close" onClick={closeComposer} aria-label="Close create story form">
                ×
              </button>
              <h2 className="dashboard-story-creator__title">Create story</h2>
              <button type="button" className="dashboard-story-creator__gear" aria-label="Story settings">⚙</button>
            </div>
            <form onSubmit={handleCreateStory}>
              {composerMode === 'gallery' ? (
                <>
                  <div className="dashboard-story-creator__tool-row">
                    <button type="button" className="dashboard-story-creator__tool dashboard-story-creator__tool--active">Text</button>
                    <button type="button" className="dashboard-story-creator__tool" disabled>Music</button>
                    <button type="button" className="dashboard-story-creator__tool" disabled>Collage</button>
                    <button type="button" className="dashboard-story-creator__tool" disabled>Template</button>
                  </div>
                  <div className="dashboard-story-creator__gallery-head">
                    <span>Gallery</span>
                    <label className="dashboard-story-creator__multi-btn">
                      Select multiple
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(event) => {
                          const files = Array.from(event.target.files ?? [])
                          if (files.length === 0) return
                          void Promise.all(files.map((file) => toBase64(file)))
                            .then((base64s) => {
                              setComposerCustomImage(base64s[0] ?? '')
                              setComposerImage(base64s[0] ?? '')
                              setComposerMode('editor')
                            })
                            .catch((e) => setComposerError(e instanceof Error ? e.message : 'Failed to load images.'))
                        }}
                      />
                    </label>
                  </div>
                  <div className="dashboard-story-creator__grid">
                    {composerGallery.map((image, index) => (
                      <button
                        key={`creator-grid-${index}`}
                        type="button"
                        className="dashboard-story-creator__grid-item"
                        onClick={() => {
                          setComposerImage(image)
                          setComposerMode('editor')
                        }}
                        aria-label={`Pick gallery image ${index + 1}`}
                      >
                        <img src={image} alt={`Gallery ${index + 1}`} />
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div className="dashboard-story-creator__editor">
                    <div className="dashboard-story-creator__preview" ref={composerPreviewRef}>
                      {composerImage ? (
                        <img src={composerImage} alt="Story preview" className="dashboard-story-creator__preview-image" />
                      ) : (
                        <div className="dashboard-story-creator__empty">Pick an image first</div>
                      )}
                      {composerText.trim() && composerImage ? (
                        <div
                          ref={composerTextRef}
                          className="dashboard-story-composer__overlay-text"
                          style={{ left: composerTextPos.x, top: composerTextPos.y }}
                          onMouseDown={beginComposerTextDrag}
                        >
                          {composerText}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div className="dashboard-story-creator__bottom-tools">
                    <button type="button" className="dashboard-story-creator__bottom-chip" disabled>Music</button>
                    <button type="button" className="dashboard-story-creator__bottom-chip" disabled>Stickers</button>
                    <button
                      type="button"
                      className={`dashboard-story-creator__bottom-chip ${composerShowTextInput ? 'is-active' : ''}`}
                      onClick={() => setComposerShowTextInput((v) => !v)}
                    >
                      Text
                    </button>
                    <button type="button" className="dashboard-story-creator__bottom-chip" disabled>Effects</button>
                    <button type="button" className="dashboard-story-creator__bottom-chip" disabled>Mention</button>
                  </div>
                  {composerShowTextInput && (
                    <div className="dashboard-story-creator__textbar">
                      <input
                        type="text"
                        className="modal-input"
                        value={composerText}
                        onChange={(event) => setComposerText(event.target.value)}
                        placeholder="Type text then drag on image"
                      />
                    </div>
                  )}
                  <div className="dashboard-story-creator__footer">
                    <div className="dashboard-story-creator__privacy">{composerType === 'ANNOUNCEMENT' ? 'Public' : 'Memo'}</div>
                    <div className="dashboard-story-creator__actions">
                      <button
                        type="button"
                        className="employees-btn employees-btn-secondary"
                        onClick={() => setComposerMode('gallery')}
                        disabled={composerBusy}
                      >
                        Back
                      </button>
                      <button type="submit" className="employees-btn employees-btn-primary" disabled={composerBusy || !composerImage}>
                        {composerBusy ? 'Sharing...' : 'Share'}
                      </button>
                    </div>
                  </div>
                </>
              )}
              {composerError && (
                <div className="dashboard-story-creator__error">{composerError}</div>
              )}
            </form>
          </div>
        </div>
      )}
    </>
  )
}
