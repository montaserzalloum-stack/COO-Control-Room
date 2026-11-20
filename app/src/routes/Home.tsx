import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground" data-test-id="home-page-container">
      <header className="border-b border-border bg-card/60 px-8 py-5" data-test-id="home-header">
        <div className="mx-auto flex max-w-6xl items-center justify-between" data-test-id="home-header-inner">
          <div data-test-id="home-branding">
            <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground" data-test-id="home-title">
              COO Control Room
            </h1>
            <p className="text-sm text-muted-foreground" data-test-id="home-subtitle">
              Executive Operations & Performance
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-8" data-test-id="home-main-content">
        <Card className="max-w-md border-border bg-card shadow-sm" data-test-id="dashboard-placeholder-card">
          <CardHeader data-test-id="dashboard-placeholder-card-header">
            <CardTitle className="font-heading text-lg font-semibold text-card-foreground" data-test-id="dashboard-placeholder-title">
              Live dashboard coming next
            </CardTitle>
          </CardHeader>
          <CardContent data-test-id="dashboard-placeholder-card-content">
            <p className="text-sm text-muted-foreground" data-test-id="dashboard-placeholder-text">
              Live dashboard coming next
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
