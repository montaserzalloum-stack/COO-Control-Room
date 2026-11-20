import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { History, SquarePen, TriangleAlert } from 'lucide-react'
import {
  CopilotChat,
  CopilotHistory,
  CopilotProvider,
  useCopilotActions,
  useCopilotStatus,
  type CopilotAppearance,
  type CopilotColorScheme,
} from '@unifyapps/app-builder-sdk/copilot'
import '@unifyapps/app-builder-sdk/copilot.css'
// after the SDK's sheet: re-points its design-system tokens at this app's theme
import './copilot-theme.css'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useIsDesktop } from '@/lib/useMediaQuery'
import { cn } from '@/lib/utils'

// The UnifyApps copilot, assembled here rather than imported whole.
//
// The SDK ships the copilot as parts — a provider, the chat, the conversation list, and
// two hooks — with no opinion about layout. That is on purpose: the SDK is a compiled
// bundle, so anything baked into it could never be restyled or rearranged from this app.
// Everything below is ordinary app code. Rearrange it, restyle it, delete what you don't
// need.
//
// Two rules come from the runtime and are not negotiable:
//   1. Every copilot piece and hook must be inside <CopilotProvider>. They reach the chat
//      by id through the store the provider creates, and throw outside it.
//   2. One <CopilotChat> and one <CopilotHistory> per provider — each resolves a single
//      fixed block id. For two copilots on one screen, use two providers with different
//      `instanceId` values.
//
// THIS FILE OWNS ONLY THE CHROME. The conversation itself (the greeting, the agent's own
// conversation starters, the composer with its attach and send controls) is rendered by
// <CopilotChat>. Never rebuild any of it around the chat: a second greeting, or a row of
// prompts above or below the agent's starters, is the same content twice. The starters
// are a setting on the agent, and the chat's empty state is the one place they appear.
//
// By default the chrome is nothing but a title bar, and only when given a `title`. "New
// chat" and past conversations are written below, but the lines in <Layout> that render
// them are commented out: uncomment them only when this app's assistant needs them (the
// `copilot` skill says when). The components stay compiled while switched off, so turning
// one on is uncommenting a line, not reviving code that drifted from the SDK; they are
// exported only so the linter does not report them unused meanwhile. Both sit in the
// title bar. Nothing floats over the conversation.
//
// It follows the app's theme through `copilot-theme.css`, which points the SDK's own
// tokens at `--primary`, `--background`, `--foreground`, `--card`, `--app-radius` and the
// heading font. Change the theme, not the copilot; `appearance` is for the message LAYOUT
// (`messageVariant`).

type CopilotProps = {
  /** the AI agent to talk to (`e_ai_agent` id) */
  agentId: string
  /** tags this copilot's conversations and narrows the history to them — one per record
   * (`journey:${id}`) gives each record its own list */
  chatSource?: string
  /** what the agent should know about where it sits: the record and step on screen */
  runtimeContext?: Record<string, unknown>
  /** The title bar. It names the SCREEN ("Assistant", "Ask Procurement"), not the agent:
   * the greeting already says who the agent is. New chat and History sit in this bar, so
   * they need it. Inside a Sheet the bar is the sheet's header, so render no SheetHeader
   * beside it. */
  title?: string
  /** Writing direction for the copilot subtree. `index.html` already carries `dir` on
   * `<html>` and this inherits it — set this only to override for a single screen.
   *
   * It is load-bearing, not cosmetic: the design system's `ltr:` / `rtl:` rules compile to
   * `:where([dir="ltr"], …)`, so with no `dir` anywhere in the document they silently do
   * nothing — message avatars stop being pulled out of the text column and land on top of
   * the message. */
  dir?: 'ltr' | 'rtl'
  /** `sm` for a drawer, side panel or any column narrower than ~640px; `lg` (the
   * default) for a full page. `lg` lays the starters out four across and leaves room for
   * a canvas beside the chat, which a narrow container crushes. */
  size?: 'sm' | 'lg'
  /** Follows the app's own light/dark (the `.dark` class on `<html>`) unless set. Pass it
   * only when the copilot must differ from the page around it. */
  colorScheme?: CopilotColorScheme
  /** `messageVariant: 'BUBBLE'` puts agent replies in bubbles too. Leave the colours to
   * the theme: inside the chat the SDK's own class names win over the app's Tailwind
   * classes of the same name (`bg-primary` there is the card colour, not `--primary`). */
  appearance?: CopilotAppearance
  /** composer placeholder */
  placeholder?: string
  /** another part of the screen that drives this copilot — the map's `useAreaChat()`: its
   * `context` joins `runtimeContext`, and its `send` posts into this conversation */
  link?: { context?: Record<string, unknown>; send: { current: ((message: string) => void) | null } }
  className?: string
}

// `'new'` is the SDK's stand-in for a conversation not created yet — truthy, and not one
const isStarted = (chatId: string | undefined) => Boolean(chatId) && chatId !== 'new'

const subscribeToRootClass = (onChange: () => void) => {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  return () => observer.disconnect()
}
const readRootScheme = (): 'light' | 'dark' =>
  document.documentElement.classList.contains('dark') ? 'dark' : 'light'

/** The app's light/dark, live. This prop is how the SDK chooses between its light and dark
 * token sets, and it defaults to light. The bridge re-points both sets, but the light one's
 * black overlays and placeholders were drawn for a light page, so a dark app has to run the
 * dark one. */
function useAppColorScheme(): 'light' | 'dark' {
  return useSyncExternalStore(subscribeToRootClass, readRootScheme, () => 'light')
}

// `sendMessage` does nothing until the chat has registered — seconds after mount while the
// runtime loads — so the link opens only once `chatId` exists ('new' before a first message).
function LinkedSend({ send }: { send: { current: ((message: string) => void) | null } }) {
  const { sendMessage } = useCopilotActions()
  const ready = useCopilotStatus().chatId !== undefined
  useEffect(() => {
    if (!ready) return
    send.current = (message) => sendMessage({ message })
    return () => {
      send.current = null
    }
  }, [send, sendMessage, ready])
  return null
}

/** Back to an empty chat, once there is a conversation to leave: before that the greeting
 * owns the panel and a reset has nothing to reset. Disabled mid-reply, so a fresh chat
 * never opens under a stream still writing into the old one. */
export function NewChatButton() {
  const { chatId, isGenerating } = useCopilotStatus()
  const { newChat } = useCopilotActions()

  if (!isStarted(chatId)) return null

  return (
    <Button disabled={isGenerating} onClick={newChat} size="sm" variant="ghost">
      <SquarePen />
      New chat
    </Button>
  )
}

type HistoryPanel = { inline: boolean; open: boolean; toggle: () => void }

const HistoryPanelContext = createContext<HistoryPanel | null>(null)

/** Where past conversations open, shared by the button that toggles them and the list: a
 * sidebar beside the chat on a wide screen, a list over the chat anywhere narrower — a
 * phone, or `size="sm"`, since a drawer is narrow whatever the viewport. */
function HistoryPanelProvider({
  size,
  children,
}: {
  size: CopilotProps['size']
  children: ReactNode
}) {
  const { chatId } = useCopilotStatus()
  const inline = useIsDesktop() && size !== 'sm'
  // The sidebar is open by default: an assistant people come back to opens on its past
  // conversations. The overlay starts closed, because it covers the chat.
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [overlayOpen, setOverlayOpen] = useState(false)
  // Picking a conversation, or starting a new one, changes the chat id; the overlay closes
  // on it so the user lands on the conversation they chose instead of the list.
  useEffect(() => setOverlayOpen(false), [chatId])

  const panel = {
    inline,
    open: inline ? sidebarOpen : overlayOpen,
    toggle: () => (inline ? setSidebarOpen : setOverlayOpen)((open) => !open),
  }
  return <HistoryPanelContext.Provider value={panel}>{children}</HistoryPanelContext.Provider>
}

function useHistoryPanel(): HistoryPanel {
  const panel = useContext(HistoryPanelContext)
  if (!panel) throw new Error('HistoryButton and HistoryList render inside <Layout>')
  return panel
}

/** One clock button at the start of the bar: the side the sidebar opens on. */
export function HistoryButton() {
  const { open, toggle } = useHistoryPanel()

  return (
    <Button
      aria-expanded={open}
      aria-label="Conversations"
      className="-ms-2"
      onClick={toggle}
      size="icon-sm"
      variant={open ? 'secondary' : 'ghost'}
    >
      <History />
    </Button>
  )
}

/** The list, mounted only while open and only one way at a time: two <CopilotHistory> in
 * one provider resolve the same block id. */
export function HistoryList() {
  const { inline, open } = useHistoryPanel()

  if (!open) return null

  return inline ? (
    // `min-h-0` is required: a flex child defaults to `min-height: auto` and would
    // otherwise grow to fit every row, scrolling the page instead of the list.
    <aside className="flex w-64 shrink-0 flex-col border-e">
      <CopilotHistory className="min-h-0 flex-1" />
    </aside>
  ) : (
    // Over the chat rather than in place of it: unmounting <CopilotChat> would unregister
    // the block every action resolves through.
    <div className="bg-background absolute inset-0 z-10 flex flex-col">
      <CopilotHistory className="min-h-0 flex-1" />
    </div>
  )
}

function Layout({ title, size }: Pick<CopilotProps, 'title' | 'size'>) {
  return (
    <HistoryPanelProvider size={size}>
      {title ? (
        // Inside a Sheet this bar is the sheet's header: `h-13` centres it on the sheet's
        // own close button (top-3, size-7), and `pe-14` leaves that button its corner, so
        // the title, the actions and the close read as one row.
        <header
          className="flex h-13 shrink-0 items-center gap-2 border-b ps-4 pe-3 in-data-[slot=sheet-content]:pe-14"
          data-slot="copilot-header"
        >
          {/* History is OFF. To switch it on, uncomment this line, <HistoryList /> below
              and <NewChatButton />. */}
          {/* <HistoryButton /> */}
          <h2 className="font-heading min-w-0 flex-1 truncate text-base font-semibold">{title}</h2>
          {/* New chat is OFF. Uncomment to switch it on. */}
          {/* <NewChatButton /> */}
        </header>
      ) : null}

      <div className="relative flex min-h-0 flex-1">
        {/* History is OFF. Uncomment together with <HistoryButton /> above. */}
        {/* <HistoryList /> */}
        {/* The chat fills whatever you give it, so the parent needs a bounded height. */}
        <div className="min-h-0 flex-1">
          <CopilotChat />
        </div>
      </div>
    </HistoryPanelProvider>
  )
}

// Without an agent there is nothing to talk to, and the copilot's own failure mode here is
// unhelpful: it waits on an agent lookup that never resolves and renders an empty box with
// no error. Catching it in the app turns a blank screen into an instruction.
function MissingAgentId() {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <Card className="max-w-md">
        <CardHeader>
          <div className="bg-muted mb-2 flex size-9 items-center justify-center rounded-md">
            <TriangleAlert className="text-muted-foreground size-5" />
          </div>
          <CardTitle>Copilot isn’t configured</CardTitle>
          <CardDescription>This copilot needs the id of the AI agent it should talk to.</CardDescription>
        </CardHeader>
        {/* A sentence with markup INSIDE it stays ONE sentence. Written as plain JSX here
            because this app speaks one language; once it ships a second, this is exactly the
            shape that must become <Trans> with numbered `components` rather than three t()
            calls glued together — word order moves between languages and glued pieces cannot
            be reordered. See the `localization` skill. */}
        <CardContent className="text-muted-foreground space-y-2 text-sm">
          <p>
            Pass an <code className="bg-muted rounded px-1 py-0.5 text-xs">agentId</code> to{' '}
            <code className="bg-muted rounded px-1 py-0.5 text-xs">&lt;Copilot /&gt;</code> — the
            agent’s <code className="bg-muted rounded px-1 py-0.5 text-xs">e_ai_agent</code> id,
            which you can copy from the agent’s page in UnifyApps.
          </p>
          <p>
            Set it wherever you render{' '}
            <code className="bg-muted rounded px-1 py-0.5 text-xs">&lt;Copilot /&gt;</code>.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

export function Copilot({
  agentId,
  chatSource,
  runtimeContext,
  title,
  dir,
  size,
  colorScheme,
  appearance,
  placeholder,
  link,
  className,
}: CopilotProps) {
  const appColorScheme = useAppColorScheme()
  const linkContext = link?.context
  const context = useMemo(
    () => (linkContext ? { ...runtimeContext, ...linkContext } : runtimeContext),
    [runtimeContext, linkContext],
  )

  if (!agentId) return <MissingAgentId />

  return (
    <CopilotProvider
      agentId={agentId}
      appearance={appearance}
      chatSource={chatSource}
      colorScheme={colorScheme ?? appColorScheme}
      placeholder={placeholder}
      runtimeContext={context}
      size={size}
      // The app's page surface, not whatever the host happens to paint: the chat inherits
      // its background, and in a drawer that is `--popover`, a white sheet over a themed
      // page. Its cards and composer sit on this the way the app's own cards do.
      className={cn('bg-background text-foreground flex h-full flex-col', className)}
      // omitted by default so the document's own dir wins — an RTL app stays RTL
      dir={dir}
    >
      {link ? <LinkedSend send={link.send} /> : null}
      <Layout size={size} title={title} />
    </CopilotProvider>
  )
}
