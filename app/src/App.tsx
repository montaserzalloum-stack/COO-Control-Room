import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { I18nProvider } from '@/lib/i18n'
import Login from '@/routes/Login'
import ForgotPassword from '@/routes/ForgotPassword'
import UpdatePassword from '@/routes/UpdatePassword'
import Home from '@/routes/Home'

// BrowserRouter (clean URLs, no #). The mount path is never hardcoded here — the engine
// bakes it in as Vite's `base` (VITE_APP_BASE, see vite.config.ts) and the app reads it
// back as BASE_URL, so one value covers every slot it serves. A deploy build bakes '/'
// (the app's domain root → basename normalizes to undefined = root); a preview slot bakes
// its /agent-api/… path. The trailing slash goes because react-router rejects '/a/b'
// against basename '/a/b/'.
const APP_BASE = import.meta.env.BASE_URL
const basename = (APP_BASE.startsWith('/') ? APP_BASE.replace(/\/+$/, '') : '') || undefined

// I18nProvider wraps the router, not main.tsx: main.tsx is engine-owned. It stays mounted
// whether or not this app is translated, because it owns <html lang/dir> (what makes the
// `ltr:`/`rtl:` Tailwind variants work at all), Radix's direction context, and the locale
// every `useFormatters()` date/number/currency is rendered in. Translation is opt-in on top
// of it — see src/lib/i18n.
export default function App() {
  return (
    <I18nProvider>
      <BrowserRouter basename={basename}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/home" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/update-password" element={<UpdatePassword />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </BrowserRouter>
    </I18nProvider>
  )
}

// The shell the first build replaces. It is a COMPONENT rather than inline JSX so that any
// hook a screen needs runs UNDER <I18nProvider> — a hook called in App() itself sits outside
// the provider App renders.
function Placeholder() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground">Ready to build.</p>
    </main>
  )
}
