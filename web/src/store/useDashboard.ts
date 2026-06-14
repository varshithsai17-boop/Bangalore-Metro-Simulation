import { create } from 'zustand'
import type { MetroData } from '../data/loadBundle'

export type SimSpeed = 1 | 2 | 5 | 10

interface Clock {
  /** Virtual (simulated) epoch-ms at the last anchor point. */
  anchorVirtual: number
  /** Real epoch-ms (Date.now) at the last anchor point. */
  anchorReal: number
  speed: SimSpeed
  paused: boolean
  /** True when tracking real system time at 1x. */
  live: boolean
}

export type Selection =
  | { kind: 'station'; id: string }
  | { kind: 'train'; id: string }
  | null

interface DashboardState {
  data: MetroData | null
  status: 'loading' | 'ready' | 'error'
  error?: string

  clock: Clock
  /** Throttled reactive "now" for UI panels (updated a few times per second). */
  nowMs: number

  selection: Selection
  lineFilter: Record<string, boolean>
  searchOpen: boolean

  // actions
  setData: (data: MetroData) => void
  setError: (msg: string) => void
  getNow: () => number
  setSpeed: (s: SimSpeed) => void
  pause: () => void
  play: () => void
  goLive: () => void
  scrubTo: (virtualMs: number, opts?: { pause?: boolean }) => void
  tick: (nowMs: number) => void
  select: (sel: Selection) => void
  toggleLine: (lineId: string) => void
  setSearchOpen: (open: boolean) => void
}

const nowReal = () => Date.now()

export const useDashboard = create<DashboardState>((set, get) => ({
  data: null,
  status: 'loading',

  clock: {
    anchorVirtual: nowReal(),
    anchorReal: nowReal(),
    speed: 1,
    paused: false,
    live: true,
  },
  nowMs: nowReal(),

  selection: null,
  lineFilter: {},
  searchOpen: false,

  setData: (data) =>
    set({
      data,
      status: 'ready',
      lineFilter: Object.fromEntries(data.lines.map((l) => [l.id, true])),
    }),
  setError: (msg) => set({ status: 'error', error: msg }),

  getNow: () => {
    const c = get().clock
    if (c.paused) return c.anchorVirtual
    return c.anchorVirtual + (nowReal() - c.anchorReal) * c.speed
  },

  setSpeed: (speed) => {
    const virtual = get().getNow()
    set({ clock: { ...get().clock, anchorVirtual: virtual, anchorReal: nowReal(), speed, paused: false, live: false } })
  },

  pause: () => {
    const virtual = get().getNow()
    set({ clock: { ...get().clock, anchorVirtual: virtual, anchorReal: nowReal(), paused: true, live: false } })
  },

  play: () => {
    const virtual = get().getNow()
    set({ clock: { ...get().clock, anchorVirtual: virtual, anchorReal: nowReal(), paused: false, live: false } })
  },

  goLive: () =>
    set({
      clock: { anchorVirtual: nowReal(), anchorReal: nowReal(), speed: 1, paused: false, live: true },
      nowMs: nowReal(),
    }),

  scrubTo: (virtualMs, opts) =>
    set({
      clock: {
        ...get().clock,
        anchorVirtual: virtualMs,
        anchorReal: nowReal(),
        paused: opts?.pause ?? get().clock.paused,
        live: false,
      },
      nowMs: virtualMs,
    }),

  tick: (nowMs) => set({ nowMs }),

  select: (selection) => set({ selection }),
  toggleLine: (lineId) =>
    set({ lineFilter: { ...get().lineFilter, [lineId]: !get().lineFilter[lineId] } }),
  setSearchOpen: (searchOpen) => set({ searchOpen }),
}))
