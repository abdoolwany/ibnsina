import type { GithubRepoInfo, GithubStatus, GithubWorkflowRun } from '@/types/monitoring'

// ============================================================
// قراءة بيانات GitHub (المستودع عام — تعمل بدون مفتاح)
// آخر نشر (آخر commit)، آخر تشغيل لمؤقتات النظام، وتقدير دقائق Actions
// ============================================================

const GITHUB_API = 'https://api.github.com'
const REPO = process.env.GITHUB_REPO ?? 'abdoolwany/ibnsina'

// المؤقتات التي تعمل على هذا المشروع (تُعرض حالتها في شاشة المراقبة)
const TRACKED_WORKFLOWS = ['keep-awake.yml', 'auto-cleanup.yml', 'resource-snapshot.yml']

function headers(): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'ibnsina-monitor',
  }
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  return h
}

interface RawRun {
  created_at: string | null
  run_started_at: string | null
  updated_at: string | null
  status: string
  conclusion: string | null
}

/** حساب دقائق التشغيل (تقديري) لتشغيلات آخر 7 أيام من وقت البدء حتى الانتهاء */
function summarizeRuns(runs: RawRun[]): { runs_7d: number; duration_minutes_7d: number } {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  let runs7d = 0
  let totalMs = 0
  for (const r of runs) {
    const start = r.run_started_at ? new Date(r.run_started_at).getTime() : NaN
    const end = r.updated_at ? new Date(r.updated_at).getTime() : NaN
    if (!Number.isNaN(start) && start >= weekAgo) {
      runs7d += 1
      if (!Number.isNaN(end) && end >= start) totalMs += end - start
    }
  }
  return { runs_7d: runs7d, duration_minutes_7d: Math.round(totalMs / 60000) }
}

/** جلب حالة GitHub الكاملة (المستودع + المؤقتات). تعيد null عند أي فشل. */
export async function fetchGithubStatus(): Promise<GithubStatus | null> {
  try {
    const [repoRes, workflowsRes] = await Promise.all([
      fetch(`${GITHUB_API}/repos/${REPO}`, { headers: headers(), next: { revalidate: 600 } }),
      fetch(`${GITHUB_API}/repos/${REPO}/actions/workflows`, { headers: headers(), next: { revalidate: 600 } }),
    ])
    if (!repoRes.ok || !workflowsRes.ok) return null

    const repoJson = await repoRes.json()
    const repo: GithubRepoInfo = {
      full_name: repoJson.full_name ?? REPO,
      private: repoJson.private === true,
      html_url: repoJson.html_url ?? `https://github.com/${REPO}`,
      size_kb: Number(repoJson.size ?? 0),
      pushed_at: repoJson.pushed_at ?? null,
      default_branch: repoJson.default_branch ?? 'master',
    }

    const workflowsJson = await workflowsRes.json()
    const all = (workflowsJson.workflows ?? []) as Array<{ id: number; name: string; path: string }>
    const tracked = all.filter((w) => TRACKED_WORKFLOWS.includes(w.path.split('/').pop() ?? ''))

    const workflowList: GithubWorkflowRun[] = []
    for (const wf of tracked) {
      const runsRes = await fetch(
        `${GITHUB_API}/repos/${REPO}/actions/workflows/${wf.id}/runs?per_page=20`,
        { headers: headers(), next: { revalidate: 600 } }
      )
      if (!runsRes.ok) continue
      const runsJson = await runsRes.json()
      const runs = (runsJson.workflow_runs ?? []) as RawRun[]
      const latest = runs[0]
      const summary = summarizeRuns(runs)
      workflowList.push({
        name: wf.name,
        path: wf.path,
        last_run_at: latest?.created_at ?? null,
        last_conclusion: latest?.conclusion ?? latest?.status ?? null,
        runs_7d: summary.runs_7d,
        duration_minutes_7d: summary.duration_minutes_7d,
      })
    }

    return { repo, workflows: workflowList }
  } catch {
    return null
  }
}
