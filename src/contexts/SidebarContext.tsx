import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react'

type SidebarContextValue = {
  isOpen: boolean
  setOpen: React.Dispatch<React.SetStateAction<boolean>>
  isCollapsed: boolean
  setCollapsed: React.Dispatch<React.SetStateAction<boolean>>
  toggle: () => void
  scrollContainerRef: React.RefObject<HTMLElement | null>
  savedScrollTopRef: React.MutableRefObject<number | null>
}

const SidebarContext = createContext<SidebarContextValue | null>(null)

function getInitialOpen(): boolean {
  if (typeof window === 'undefined') return true
  return !window.matchMedia('(max-width: 768px)').matches
}

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(getInitialOpen)
  const [isCollapsed, setCollapsed] = useState(false)
  const scrollContainerRef = useRef<HTMLElement | null>(null)
  const savedScrollTopRef = useRef<number | null>(null)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    const fn = () => {
      if (mq.matches) setOpen(false)
      else setOpen(true)
    }
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])

  const toggle = useCallback(() => {
    if (scrollContainerRef.current) {
      savedScrollTopRef.current = scrollContainerRef.current.scrollTop
    }
    setOpen((o) => !o)
  }, [])

  return (
    <SidebarContext.Provider value={{ isOpen, setOpen, isCollapsed, setCollapsed, toggle, scrollContainerRef, savedScrollTopRef }}>
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebar() {
  const ctx = useContext(SidebarContext)
  if (!ctx) {
    throw new Error('useSidebar must be used within SidebarProvider')
  }
  return ctx
}
