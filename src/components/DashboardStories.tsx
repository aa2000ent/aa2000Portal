import { useEffect, useMemo, useRef, useState } from 'react'
import { apiRequest } from '../api/client'
import { getPortalAccountId, getPortalEmpId, getPortalUsername } from '../api/client'
import { fetchEmployees } from '../api/employees'
import {
  createStory,
  dataUrlToFile,
  deleteStory,
  fetchStories,
  isStoryVideoUrl,
  mapStoriesForDashboard,
  type DashboardStoryItem,
} from '../api/stories'

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

function sortNewestFirst(list: DashboardStoryItem[]): DashboardStoryItem[] {
  return [...list].sort((a, b) => {
    const at = new Date(a.date || 0).getTime()
    const bt = new Date(b.date || 0).getTime()
    if (bt !== at) return bt - at
    return b.storyId - a.storyId
  })
}

function formatDateLabel(value?: string): string {
  if (!value) return 'No date'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No date'
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('Failed to read image file.'))
    reader.readAsDataURL(file)
  })
}

function createTextStoryBackground(): string {
  const canvas = document.createElement('canvas')
  canvas.width = 1080
  canvas.height = 1920
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
  gradient.addColorStop(0, '#4f46e5')
  gradient.addColorStop(0.5, '#60a5fa')
  gradient.addColorStop(1, '#ec4899')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.92)
}

async function optimizeStoryImage(imageSrc: string, maxDim = 1600): Promise<string> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to optimize story image.'))
    img.src = imageSrc
  })

  const iw = image.naturalWidth || image.width
  const ih = image.naturalHeight || image.height
  if (!iw || !ih) return imageSrc

  const scale = Math.min(1, maxDim / Math.max(iw, ih))
  const ow = Math.max(1, Math.round(iw * scale))
  const oh = Math.max(1, Math.round(ih * scale))

  const canvas = document.createElement('canvas')
  canvas.width = ow
  canvas.height = oh
  const ctx = canvas.getContext('2d')
  if (!ctx) return imageSrc
  ctx.drawImage(image, 0, 0, ow, oh)
  return canvas.toDataURL('image/jpeg', 0.88)
}

async function composeStoryImageWithText(
  imageSrc: string,
  text: string,
  textPos: { x: number; y: number },
  previewEl: HTMLDivElement,
  textEl: HTMLDivElement,
): Promise<string> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load story image for text composition.'))
    img.src = imageSrc
  })

  const iw = image.naturalWidth || image.width
  const ih = image.naturalHeight || image.height
  if (!iw || !ih) throw new Error('Story image dimensions are invalid.')

  const previewRect = previewEl.getBoundingClientRect()
  const pw = Math.max(1, previewRect.width)
  const ph = Math.max(1, previewRect.height)
  const scale = Math.min(pw / iw, ph / ih) // object-fit: contain
  const renderedW = iw * scale
  const renderedH = ih * scale
  const offsetX = (pw - renderedW) / 2
  const offsetY = (ph - renderedH) / 2

  const canvas = document.createElement('canvas')
  canvas.width = iw
  canvas.height = ih
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Cannot compose story image.')

  ctx.drawImage(image, 0, 0, iw, ih)

  const computed = window.getComputedStyle(textEl)
  const previewFontSize = parseFloat(computed.fontSize || '16')
  const previewLineHeight = parseFloat(computed.lineHeight || String(previewFontSize * 1.35))
  const fontWeight = computed.fontWeight || '700'
  const fontFamily = computed.fontFamily || 'system-ui'
  const fillColor = computed.color || '#ffffff'

  const x = Math.max(0, Math.min(iw, (textPos.x - offsetX) / scale))
  const y = Math.max(0, Math.min(ih, (textPos.y - offsetY) / scale))
  const fontSize = Math.max(12, previewFontSize / scale)
  const lineHeight = Math.max(fontSize * 1.2, previewLineHeight / scale)

  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'

  const shadowBlur = Math.max(2, 10 / scale)
  ctx.shadowColor = 'rgba(0, 0, 0, 0.85)'
  ctx.shadowBlur = shadowBlur
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = Math.max(1, 2 / scale)
  ctx.fillStyle = fillColor

  const lines = text.split('\n')
  lines.forEach((line, index) => {
    ctx.fillText(line, x, y + index * lineHeight)
  })

  return canvas.toDataURL('image/jpeg', 0.92)
}

export default function DashboardStories() {
  const [items, setItems] = useState<DashboardStoryItem[]>([])
  const [currentUserPhotoUrl, setCurrentUserPhotoUrl] = useState<string | undefined>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [reactions, setReactions] = useState<StoryReactionMap>({})
  const [viewedStories, setViewedStories] = useState<StoryViewedMap>({})
  const [mediaAttemptIndex, setMediaAttemptIndex] = useState<Record<number, number>>({})
  const [openComposer, setOpenComposer] = useState(false)
  const [empIdByAccId, setEmpIdByAccId] = useState<Record<number, number>>({})
  const [composerKind, setComposerKind] = useState<'photo' | 'text' | null>(null)
  const [composerImage, setComposerImage] = useState('')
  const [composerText, setComposerText] = useState('')
  const [composerTextColor, setComposerTextColor] = useState('#ffffff')
  const [composerTextSize, setComposerTextSize] = useState(34)
  const [composerMode, setComposerMode] = useState<'entry' | 'gallery' | 'editor'>('entry')
  const [composerShowTextInput, setComposerShowTextInput] = useState(false)
  const [composerTextPos, setComposerTextPos] = useState({ x: 46, y: 60 })
  const [composerDragging, setComposerDragging] = useState(false)
  const [composerCustomImage, setComposerCustomImage] = useState('')
  const [composerError, setComposerError] = useState<string | null>(null)
  const [composerBusy, setComposerBusy] = useState(false)
  const [deleteBusyId, setDeleteBusyId] = useState<number | null>(null)
  const [storyMenuOpen, setStoryMenuOpen] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [replySending, setReplySending] = useState(false)
  const [replySent, setReplySent] = useState(false)
  const preloadedMediaRef = useRef<Set<string>>(new Set())
  const preloadPromisesRef = useRef<Map<string, Promise<void>>>(new Map())
  const composerPreviewRef = useRef<HTMLDivElement | null>(null)
  const composerTextRef = useRef<HTMLDivElement | null>(null)
  const composerPhotoInputRef = useRef<HTMLInputElement | null>(null)
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
      const [rawStories, employees] = await Promise.all([fetchStories(), fetchEmployees()])
      const mapped = mapStoriesForDashboard(rawStories as unknown[], employees)
      const merged = sortNewestFirst(mapped).slice(0, 12)
      setItems(merged)
      const currentAccId = Number(getPortalAccountId() ?? 0)
      const currentEmpId = Number(getPortalEmpId() ?? 0)
      const username = String(getPortalUsername() ?? '').trim().toLowerCase()
      const me =
        (currentAccId > 0 ? employees.find((emp) => Number(emp.accId ?? 0) === currentAccId) : undefined) ??
        (currentEmpId > 0 ? employees.find((emp) => Number(emp.id ?? 0) === currentEmpId) : undefined) ??
        (username
          ? employees.find((emp) => {
              const email = String(emp.email ?? '').trim().toLowerCase()
              const name = String(emp.name ?? '').trim().toLowerCase()
              return email === username || name === username
            })
          : undefined)
      setCurrentUserPhotoUrl(me?.photoUrl)
      const nextEmp: Record<number, number> = {}
      for (const emp of employees) {
        const accId = Number(emp.accId ?? 0)
        const id = Number(emp.id ?? 0)
        if (accId > 0 && id > 0) nextEmp[accId] = id
      }
      setEmpIdByAccId(nextEmp)
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
    setStoryMenuOpen(false)
  }, [selectedIndex])

  useEffect(() => {
    if (selectedIndex === null) return
    const selectedItem = items[selectedIndex]
    if (!selectedItem) return
    const key = String(selectedItem.storyId)
    setViewedStories((prev) => (prev[key] ? prev : { ...prev, [key]: true }))
  }, [selectedIndex, items])

  useEffect(() => {
    // Reset URL fallback attempts whenever story data is refreshed.
    setMediaAttemptIndex({})
  }, [items])
  useEffect(() => {
    if (items.length === 0) return
    const allImageUrls = new Set<string>()
    for (const item of items) {
      const src = resolveMediaSrc(item)
      if (!src || isStoryVideoUrl(src)) continue
      allImageUrls.add(src)
    }
    for (const src of allImageUrls) {
      if (preloadedMediaRef.current.has(src)) continue
      if (preloadPromisesRef.current.has(src)) continue
      const p = new Promise<void>((resolve) => {
        const img = new Image()
        img.decoding = 'async'
        img.fetchPriority = 'high'
        img.onload = () => {
          preloadedMediaRef.current.add(src)
          preloadPromisesRef.current.delete(src)
          resolve()
        }
        img.onerror = () => {
          preloadPromisesRef.current.delete(src)
          resolve()
        }
        img.src = src
      })
      preloadPromisesRef.current.set(src, p)
    }
  }, [items, mediaAttemptIndex])

  const hasItems = useMemo(() => items.length > 0, [items])
  const currentAccId = useMemo(() => Number(getPortalAccountId() ?? 0), [])
  const currentEmpId = useMemo(() => Number(getPortalEmpId() ?? 0), [])
  const canCreateStories = true
  const isStoryViewed = (id: number): boolean => Boolean(viewedStories[String(id)])
  const storyOwnerKey = (item: DashboardStoryItem): string => {
    if (item.accId > 0) return `acc:${item.accId}`
    if (item.employeeId > 0) return `emp:${item.employeeId}`
    return `title:${item.title.trim().toLowerCase()}`
  }
  const isMyStoryOwner = (item: DashboardStoryItem): boolean => {
    if (currentAccId > 0 && item.accId > 0) return item.accId === currentAccId
    if (currentEmpId > 0 && item.employeeId > 0) return item.employeeId === currentEmpId
    return false
  }
  const railItems = useMemo(() => {
    const byOwner = new Map<string, { item: DashboardStoryItem; hasUnseen: boolean }>()
    for (const item of items) {
      const key = storyOwnerKey(item)
      const unseen = !isStoryViewed(item.storyId)
      const existing = byOwner.get(key)
      if (!existing) {
        // `items` is newest-first; first item for this owner is their latest story.
        byOwner.set(key, { item, hasUnseen: unseen })
      } else if (unseen) {
        existing.hasUnseen = true
      }
    }
    const grouped = [...byOwner.values()]
    const mine = grouped.filter(({ item }) => isMyStoryOwner(item))
    const others = grouped.filter(({ item }) => !isMyStoryOwner(item))
    const sortBySeen = (list: Array<{ item: DashboardStoryItem; hasUnseen: boolean }>) => [
      ...list.filter((x) => x.hasUnseen),
      ...list.filter((x) => !x.hasUnseen),
    ]
    return [...sortBySeen(mine), ...sortBySeen(others)]
  }, [items, viewedStories, currentAccId, currentEmpId])
  const groupedOwnerItems = useMemo(() => railItems.map((x) => x.item), [railItems])

  const handleAddStory = () => {
    if (!canCreateStories) return
    setSelectedIndex(null)
    setComposerKind(null)
    setComposerImage('')
    setComposerMode('entry')
    setComposerShowTextInput(false)
    setComposerCustomImage('')
    setComposerText('')
    setComposerTextColor('#ffffff')
    setComposerTextSize(34)
    setComposerTextPos({ x: 46, y: 60 })
    setComposerError(null)
    setOpenComposer(true)
  }

  const handleChoosePhotoStory = () => {
    setComposerKind('photo')
    setComposerImage('')
    setComposerMode('entry')
    setComposerShowTextInput(false)
    setComposerError(null)
    // Open device storage picker immediately (FB-like photo story flow).
    composerPhotoInputRef.current?.click()
  }

  const handleChooseTextStory = () => {
    const background = createTextStoryBackground()
    setComposerKind('text')
    setComposerImage(background)
    setComposerMode('editor')
    setComposerShowTextInput(true)
    setComposerTextColor('#ffffff')
    setComposerTextSize(42)
    setComposerTextPos({ x: 120, y: 220 })
    setComposerError(null)
  }

  const selected = selectedIndex !== null ? items[selectedIndex] ?? null : null
  const selectedReaction = selected ? reactions[String(selected.storyId)] : undefined
  const canDeleteSelected = useMemo(() => {
    if (!selected) return false
    const currentEmpId = Number(getPortalEmpId() ?? 0)
    const username = String(getPortalUsername() ?? '').trim().toLowerCase()
    const selectedTitle = String(selected.title ?? '').trim().toLowerCase()
    const selectedCaption = String(selected.caption ?? '').trim().toLowerCase()
    const mappedEmpId = currentAccId > 0 ? Number(empIdByAccId[currentAccId] ?? 0) : 0

    if (currentAccId > 0 && Number(selected.accId ?? 0) === currentAccId) return true
    if (currentEmpId > 0 && Number(selected.employeeId ?? 0) === currentEmpId) return true
    if (mappedEmpId > 0 && Number(selected.employeeId ?? 0) === mappedEmpId) return true
    if (username && (selectedTitle === username || selectedCaption === username)) return true
    return false
  }, [selected, currentAccId, empIdByAccId])
  const selectedOwnerStories = useMemo(() => {
    if (!selected) return [] as DashboardStoryItem[]
    const key = storyOwnerKey(selected)
    return items.filter((item) => storyOwnerKey(item) === key)
  }, [items, selected])
  const selectedOwnerStoryIndex = useMemo(() => {
    if (!selected) return 0
    const idx = selectedOwnerStories.findIndex((item) => item.storyId === selected.storyId)
    return idx >= 0 ? idx : 0
  }, [selected, selectedOwnerStories])
  useEffect(() => {
    if (!selected || items.length === 0) return
    const toPreload = new Set<string>()
    const selectedIdx = items.findIndex((x) => x.storyId === selected.storyId)
    if (selectedIdx < 0) return
    const neighborIndexes = [
      (selectedIdx + 1) % items.length,
      (selectedIdx - 1 + items.length) % items.length,
    ]
    for (const idx of neighborIndexes) {
      const candidate = resolveMediaSrc(items[idx])
      if (candidate && !isStoryVideoUrl(candidate)) toPreload.add(candidate)
    }
    for (const ownerStory of selectedOwnerStories) {
      const candidate = resolveMediaSrc(ownerStory)
      if (candidate && !isStoryVideoUrl(candidate)) toPreload.add(candidate)
    }
    for (const src of toPreload) {
      if (preloadedMediaRef.current.has(src)) continue
      preloadedMediaRef.current.add(src)
      const existing = preloadPromisesRef.current.get(src)
      if (existing) continue
      const p = new Promise<void>((resolve) => {
        const img = new Image()
        img.decoding = 'async'
        img.fetchPriority = 'high'
        img.onload = () => {
          preloadedMediaRef.current.add(src)
          preloadPromisesRef.current.delete(src)
          resolve()
        }
        img.onerror = () => {
          preloadPromisesRef.current.delete(src)
          resolve()
        }
        img.src = src
      })
      preloadPromisesRef.current.set(src, p)
    }
  }, [selected, items, selectedOwnerStories])
  const resolveMediaSrc = (item: DashboardStoryItem): string => {
    const idx = mediaAttemptIndex[item.storyId] ?? 0
    return item.mediaCandidates[idx] ?? item.mediaCandidates[0] ?? item.mediaUrl
  }
  const advanceMediaFallback = (item: DashboardStoryItem) => {
    if (!item.mediaCandidates || item.mediaCandidates.length <= 1) return
    setMediaAttemptIndex((prev) => {
      const current = prev[item.storyId] ?? 0
      if (current >= item.mediaCandidates.length - 1) return prev
      return { ...prev, [item.storyId]: current + 1 }
    })
  }

  const sendReply = async (story: DashboardStoryItem) => {
    const text = replyText.trim()
    if (!text || replySending) return
    const receiverEmpId = story.employeeId
    if (!(receiverEmpId > 0)) return
    const senderEmpId = getPortalEmpId() ?? 0
    if (!(senderEmpId > 0)) return
    setReplySending(true)
    try {
      await apiRequest(`/ai-services-conversation-chat/webhook/conversation/${receiverEmpId}`, {
        method: 'POST',
        body: JSON.stringify({
          senderEmpID: senderEmpId,
          receiverEmpID: receiverEmpId,
          message: text,
        }),
        portal: { suppressFailureLog: true },
      })
      setReplyText('')
      setReplySent(true)
      setTimeout(() => setReplySent(false), 2500)
    } catch {
      // silently fail — message still shows sent indicator
    } finally {
      setReplySending(false)
    }
  }

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
  const goPrevStory = () => {
    if (items.length === 0) return
    setSelectedIndex((prev) => (prev === null ? 0 : (prev - 1 + items.length) % items.length))
  }
  const goNextStory = () => {
    if (items.length === 0) return
    setSelectedIndex((prev) => (prev === null ? 0 : (prev + 1) % items.length))
  }

  const handleDeleteSelectedStory = async () => {
    if (!selected || !canDeleteSelected || deleteBusyId !== null) return
    const ok = window.confirm('Delete this story? This cannot be undone.')
    if (!ok) return
    setDeleteBusyId(selected.storyId)
    setStoryMenuOpen(false)
    try {
      const removed = await deleteStory(selected.storyId)
      if (!removed) {
        setError('Failed to delete story. Please try again.')
        return
      }
      setSelectedIndex(null)
      await loadStories()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete story.')
    } finally {
      setDeleteBusyId(null)
    }
  }

  const composerGallery = useMemo(() => {
    const uniq = new Set<string>()
    const result: string[] = []
    if (composerCustomImage) {
      uniq.add(composerCustomImage)
      result.push(composerCustomImage)
    }
    for (const item of items) {
      if (!item.mediaUrl) continue
      if (uniq.has(item.mediaUrl)) continue
      uniq.add(item.mediaUrl)
      result.push(item.mediaUrl)
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
      const employeeId = Number(empIdByAccId[accId] ?? getPortalEmpId() ?? accId ?? 0)
      if (!employeeId) {
        setComposerError(
          'Your account is not linked to an employee record. Ask an admin to link your portal account to an employee so you can post stories.',
        )
        return
      }
      const text = composerText.trim()
      const posterName = String(getPortalUsername() ?? '').trim()
      const fallbackTitle = `User ${accId}`
      let finalImage = await optimizeStoryImage(composerImage.trim())
      if (text && composerPreviewRef.current && composerTextRef.current) {
        finalImage = await composeStoryImageWithText(
          finalImage,
          text,
          composerTextPos,
          composerPreviewRef.current,
          composerTextRef.current,
        )
      }
      const file = dataUrlToFile(finalImage, 'story.jpg')
      await createStory({
        file,
        filename: file.name,
        caption: text || posterName || fallbackTitle,
        employeeId,
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
      <section className="dashboard-stories" aria-label="Team stories">
        <div className="dashboard-stories__head">
          <h2 className="dashboard-stories__title">Stories</h2>
          <span className="dashboard-stories__hint">Latest stories</span>
        </div>
        {loading ? (
          <div className="dashboard-stories__rail">
            {[...Array(6)].map((_, i) => (
              <div key={`story-skeleton-${i}`} className="dashboard-story animate-pulse" style={{ pointerEvents: 'none', cursor: 'default' }}>
                <span className="dashboard-story__avatar-wrap" style={{ background: 'var(--aa-content-border)', border: 'none' }} />
                <span className="dashboard-story__label">
                  <div style={{ height: '12px', background: 'var(--aa-content-border)', borderRadius: '4px', width: '60%', margin: '0 auto' }} />
                </span>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="dashboard-stories__empty">{error}</div>
        ) : !hasItems ? (
          <div className="dashboard-stories__rail">
            {canCreateStories && (
              <button type="button" className="dashboard-story dashboard-story--add" onClick={handleAddStory}>
                <span className={`dashboard-story__avatar-wrap dashboard-story__avatar-wrap--add ${currentUserPhotoUrl ? 'dashboard-story__avatar-wrap--with-photo' : ''}`}>
                  {currentUserPhotoUrl ? <img src={currentUserPhotoUrl} alt="" className="dashboard-story__avatar" /> : null}
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
                <span className={`dashboard-story__avatar-wrap dashboard-story__avatar-wrap--add ${currentUserPhotoUrl ? 'dashboard-story__avatar-wrap--with-photo' : ''}`}>
                  {currentUserPhotoUrl ? <img src={currentUserPhotoUrl} alt="" className="dashboard-story__avatar" /> : null}
                  <span className="dashboard-story__avatar dashboard-story__avatar--add">+</span>
                </span>
                <span className="dashboard-story__label">Add story</span>
              </button>
            )}
            {railItems.map(({ item, hasUnseen }) => (
              <button
                key={`story-${item.storyId}`}
                type="button"
                className={`dashboard-story ${hasUnseen ? '' : 'is-seen'}`}
                onClick={() => {
                  const ownerKey = storyOwnerKey(item)
                  const originalIndex = items.findIndex((row) => storyOwnerKey(row) === ownerKey)
                  if (originalIndex >= 0) setSelectedIndex(originalIndex)
                }}
                aria-label={`Open story ${item.title || 'Untitled'}`}
              >
                <span className="dashboard-story__avatar-wrap">
                  {resolveMediaSrc(item) ? (
                    isStoryVideoUrl(resolveMediaSrc(item)) ? (
                      <video
                        src={resolveMediaSrc(item)}
                        className="dashboard-story__avatar"
                        muted
                        playsInline
                        preload="metadata"
                        aria-hidden
                        onError={() => advanceMediaFallback(item)}
                      />
                    ) : (
                      <img src={resolveMediaSrc(item)} alt="" className="dashboard-story__avatar" onError={() => advanceMediaFallback(item)} />
                    )
                  ) : (
                    <span className="dashboard-story__avatar dashboard-story__avatar--placeholder">
                      {(item.title || 'S').trim().slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span
                    className={`dashboard-story__status-corner ${hasUnseen ? 'is-unseen' : 'is-seen'}`}
                    aria-hidden
                  />
                  <span className="dashboard-story__author">
                    <span className="dashboard-story__author-meta">
                      <span className="dashboard-story__author-profile" aria-hidden>
                        {item.authorPhotoUrl ? (
                          <img src={item.authorPhotoUrl} alt="" />
                        ) : (
                          <span>{(item.title || 'U').trim().slice(0, 1).toUpperCase()}</span>
                        )}
                      </span>
                      <span>{item.title}</span>
                    </span>
                  </span>
                </span>
                <span className="dashboard-story__label">{item.title || 'Untitled'}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {selected && (
        <div className="dashboard-announcement-dialog-backdrop" role="presentation" onClick={() => setSelectedIndex(null)}>
          <div className="dashboard-story-viewer" role="dialog" aria-modal="true" aria-label={selected.title || 'Story details'} onClick={(event) => event.stopPropagation()}>
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
                  <span className={`dashboard-story__avatar-wrap dashboard-story__avatar-wrap--add ${currentUserPhotoUrl ? 'dashboard-story__avatar-wrap--with-photo' : ''}`}>
                    {currentUserPhotoUrl ? <img src={currentUserPhotoUrl} alt="" className="dashboard-story__avatar" /> : null}
                    <span className="dashboard-story__avatar dashboard-story__avatar--add">+</span>
                  </span>
                  <span className="dashboard-story__label">Create story</span>
                </button>
              )}
              <div className="dashboard-story-viewer__list">
                {groupedOwnerItems.map((item) => (
                  <button
                    key={`viewer-item-${item.storyId}`}
                    type="button"
                    className={`dashboard-story-viewer__list-item ${selected && storyOwnerKey(selected) === storyOwnerKey(item) ? 'is-active' : ''} ${isStoryViewed(item.storyId) ? 'is-seen' : ''}`}
                    onClick={() => {
                      const ownerKey = storyOwnerKey(item)
                      const ownerFirstIndex = items.findIndex((row) => storyOwnerKey(row) === ownerKey)
                      if (ownerFirstIndex >= 0) setSelectedIndex(ownerFirstIndex)
                    }}
                    aria-label={`Open ${item.title || 'Untitled'} story`}
                  >
                    <span className="dashboard-story-viewer__list-avatar">
                      {resolveMediaSrc(item) ? (
                        isStoryVideoUrl(resolveMediaSrc(item)) ? (
                          <video src={resolveMediaSrc(item)} muted playsInline preload="metadata" aria-hidden onError={() => advanceMediaFallback(item)} />
                        ) : (
                          <img src={resolveMediaSrc(item)} alt="" onError={() => advanceMediaFallback(item)} />
                        )
                      ) : (
                        <span>{(item.title || 'S').trim().slice(0, 1).toUpperCase()}</span>
                      )}
                      <span
                        className={`dashboard-story-viewer__list-corner ${isStoryViewed(item.storyId) ? 'is-seen' : 'is-unseen'}`}
                        aria-hidden
                      />
                    </span>
                    <span className="dashboard-story-viewer__list-copy">
                      <strong className="dashboard-story-viewer__list-author">
                        <span className="dashboard-story-viewer__author-profile" aria-hidden>
                          {item.authorPhotoUrl ? (
                            <img src={item.authorPhotoUrl} alt="" />
                          ) : (
                            <span>{(item.title || 'U').trim().slice(0, 1).toUpperCase()}</span>
                          )}
                        </span>
                        <span>{item.title}</span>
                      </strong>
                      <small>{formatDateLabel(item.date)}</small>
                    </span>
                  </button>
                ))}
              </div>
            </aside>

            <div className="dashboard-story-viewer__stage">
              <button
                type="button"
                className="dashboard-story-viewer__tap-zone dashboard-story-viewer__tap-zone--prev"
                onClick={goPrevStory}
                aria-label="Previous story"
              />
              <article className="dashboard-story-viewer__card">
                <div
                  className="dashboard-story-media-wrap"
                  onClick={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect()
                    const x = event.clientX - rect.left
                    if (x < rect.width / 2) goPrevStory()
                    else goNextStory()
                  }}
                >
                  {selectedOwnerStories.length > 0 && (
                    <div className="dashboard-story-progress" aria-label="Story progress">
                      {selectedOwnerStories.map((ownerStory, idx) => (
                        <span
                          key={`story-progress-${ownerStory.storyId}`}
                          className={`dashboard-story-progress__segment ${idx <= selectedOwnerStoryIndex ? 'is-active' : ''}`}
                          aria-hidden
                        />
                      ))}
                    </div>
                  )}
                  <div className="dashboard-story-topbar" onClick={(event) => event.stopPropagation()}>
                    <div className="dashboard-story-topbar__author">
                      <span className="dashboard-story-topbar__avatar" aria-hidden>
                        {selected.authorPhotoUrl ? (
                          <img src={selected.authorPhotoUrl} alt="" />
                        ) : (
                          <span>{(selected.title || 'U').trim().slice(0, 1).toUpperCase()}</span>
                        )}
                      </span>
                      <span className="dashboard-story-topbar__copy">
                        <strong>{selected.title || 'Unknown user'}</strong>
                        <small>{formatDateLabel(selected.date)} · 🌐</small>
                      </span>
                    </div>
                    <div className="dashboard-story-topbar__actions">
                      <button type="button" className="dashboard-story-topbar__icon-btn" aria-label="Sound" title="Sound">
                        🔊
                      </button>
                      <button type="button" className="dashboard-story-topbar__icon-btn" aria-label="Play" title="Play">
                        ▶
                      </button>
                      {canDeleteSelected && (
                        <div className="dashboard-story-menu-wrap">
                          <button
                            type="button"
                            className="dashboard-story-topbar__icon-btn"
                            onClick={() => setStoryMenuOpen((v) => !v)}
                            aria-label="Story options"
                            title="Story options"
                          >
                            ⋯
                          </button>
                          {storyMenuOpen && (
                            <div className="dashboard-story-menu dashboard-story-menu--top" role="menu" aria-label="Story options menu">
                              <button
                                type="button"
                                className="dashboard-story-menu__item"
                                onClick={handleDeleteSelectedStory}
                                disabled={deleteBusyId === selected?.storyId}
                              >
                                {deleteBusyId === selected?.storyId ? 'Deleting...' : 'Delete story'}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  {resolveMediaSrc(selected) ? (
                    isStoryVideoUrl(resolveMediaSrc(selected)) ? (
                      <video
                        src={resolveMediaSrc(selected)}
                        controls
                        className="dashboard-announcement-dialog__image"
                        playsInline
                        onError={() => advanceMediaFallback(selected)}
                      />
                    ) : (
                      <img
                        src={resolveMediaSrc(selected)}
                        alt={selected.title}
                        className="dashboard-announcement-dialog__image"
                        loading="eager"
                        fetchPriority="high"
                        decoding="sync"
                        onError={() => advanceMediaFallback(selected)}
                      />
                    )
                  ) : (
                    <div className="dashboard-announcement-dialog__image dashboard-announcement-dialog__image--placeholder">
                      <div className="dashboard-story-viewer__no-image-copy">
                        <strong>{selected.title || 'Untitled'}</strong>
                        <p>{selected.caption || 'No media available for this story.'}</p>
                      </div>
                    </div>
                  )}
                </div>
              </article>
              <button
                type="button"
                className="dashboard-story-viewer__tap-zone dashboard-story-viewer__tap-zone--next"
                onClick={goNextStory}
                aria-label="Next story"
              />
              <footer className="dashboard-story-viewer__footer">
                <form
                  className="dashboard-story-viewer__reply-form"
                  onSubmit={(e) => { e.preventDefault(); void sendReply(selected) }}
                >
                  <input
                    className="dashboard-story-viewer__message"
                    type="text"
                    placeholder={replySent ? 'Message sent!' : 'Send message...'}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    disabled={replySending}
                    maxLength={500}
                    aria-label="Reply to story"
                  />
                  {replyText.trim() && (
                    <button
                      type="submit"
                      className="dashboard-story-viewer__reply-send"
                      disabled={replySending}
                      aria-label="Send reply"
                    >
                      {replySending ? '...' : '➤'}
                    </button>
                  )}
                </form>
                <div className="dashboard-story-reactions" aria-label="Story reactions">
                  {STORY_REACTIONS.map((reaction) => {
                    const isActive = selectedReaction === reaction.key
                    return (
                      <button
                        key={reaction.key}
                        type="button"
                        className={`dashboard-story-reaction-btn ${isActive ? 'is-active' : ''}`}
                        onClick={() => toggleReaction(String(selected.storyId), reaction.key)}
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
            <input
              ref={composerPhotoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (!file) return
                void toBase64(file)
                  .then((base64) => {
                    setComposerCustomImage(base64)
                    setComposerImage(base64)
                    setComposerMode('editor')
                    setComposerShowTextInput(false)
                    setComposerError(null)
                  })
                  .catch((e) => setComposerError(e instanceof Error ? e.message : 'Failed to load image.'))
                  .finally(() => {
                    // Allow selecting the same file again later.
                    event.target.value = ''
                  })
              }}
            />
            <div className="dashboard-story-creator__header">
              <button type="button" className="dashboard-story-creator__close" onClick={closeComposer} aria-label="Close create story form">
                ×
              </button>
              <h2 className="dashboard-story-creator__title">Create story</h2>
              <button type="button" className="dashboard-story-creator__gear" aria-label="Story settings">⚙</button>
            </div>
            <form onSubmit={handleCreateStory}>
              {composerMode === 'entry' ? (
                <div className="dashboard-story-choice">
                  <button
                    type="button"
                    className="dashboard-story-choice__card dashboard-story-choice__card--photo"
                    onClick={handleChoosePhotoStory}
                  >
                    <span className="dashboard-story-choice__icon" aria-hidden>🖼️</span>
                    <span className="dashboard-story-choice__label">Create a photo story</span>
                  </button>
                  <button
                    type="button"
                    className="dashboard-story-choice__card dashboard-story-choice__card--text"
                    onClick={handleChooseTextStory}
                  >
                    <span className="dashboard-story-choice__icon" aria-hidden>Aa</span>
                    <span className="dashboard-story-choice__label">Create a text story</span>
                  </button>
                </div>
              ) : composerMode === 'gallery' ? (
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
                          style={{ left: composerTextPos.x, top: composerTextPos.y, color: composerTextColor, fontSize: `${composerTextSize}px` }}
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
                      <div className="dashboard-story-creator__text-controls">
                        <label className="dashboard-story-creator__text-control">
                          <span>Color</span>
                          <input
                            type="color"
                            value={composerTextColor}
                            onChange={(event) => setComposerTextColor(event.target.value)}
                            aria-label="Text color"
                          />
                        </label>
                        <label className="dashboard-story-creator__text-control dashboard-story-creator__text-control--size">
                          <span>Size</span>
                          <input
                            type="range"
                            min={20}
                            max={76}
                            step={1}
                            value={composerTextSize}
                            onChange={(event) => setComposerTextSize(Number(event.target.value))}
                            aria-label="Text size"
                          />
                          <strong>{composerTextSize}px</strong>
                        </label>
                      </div>
                    </div>
                  )}
                  <div className="dashboard-story-creator__footer">
                    <div className="dashboard-story-creator__privacy">Shared with your team</div>
                    <div className="dashboard-story-creator__actions">
                      <button
                        type="button"
                        className="employees-btn employees-btn-secondary"
                        onClick={() => {
                          if (composerKind === 'photo') setComposerMode('gallery')
                          else setComposerMode('entry')
                        }}
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
