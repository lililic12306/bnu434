/**
 * bnu434 · 浏览器半
 * 入口：左上角一级侧边栏（sidebar.panellist）+ 主页面（main），并保留设置页入口作为备用。
 * 页面：真题分析 / 模拟题 / 资料库 / 说明。
 */
window.__ModuleLoader__.load({
  id: 'bnu434',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    // 面板可能因切换主视图而卸载重挂，用模块级 store 保住界面状态
    const store = {}
    function usePersistent(key, initial) {
      const [value, setValue] = React.useState(() => (key in store ? store[key] : (typeof initial === 'function' ? initial() : initial)))
      const set = (next) => {
        const resolved = typeof next === 'function' ? next(key in store ? store[key] : value) : next
        store[key] = resolved
        setValue(resolved)
      }
      return [value, set]
    }

    const C = {
      text: 'var(--dsw-alias-text-primary, #1f2328)',
      muted: 'var(--dsw-alias-text-tertiary, #6b7280)',
      border: 'var(--dsw-alias-border-secondary, #e5e7eb)',
      bg: 'var(--dsw-alias-bg-primary, #fff)',
      brand: '#1f6feb',
    }
    const S = {
      wrap: { padding: '20px 24px 40px', width: '100%', maxWidth: 1080, margin: '0 auto', color: C.text, lineHeight: 1.65, height: '100%', maxHeight: 'calc(100vh - 88px)', overflowY: 'auto', boxSizing: 'border-box' },
      title: { fontSize: 20, fontWeight: 700, margin: '0 0 4px' },
      sub: { fontSize: 12, color: C.muted, marginBottom: 14 },
      tabs: { display: 'flex', gap: 8, borderBottom: '1px solid ' + C.border, marginBottom: 16, flexWrap: 'wrap' },
      tab: (on) => ({
        padding: '7px 14px', border: 'none', borderBottom: on ? '2px solid ' + C.brand : '2px solid transparent',
        background: 'transparent', color: on ? C.brand : C.muted, cursor: 'pointer', fontSize: 13, fontWeight: on ? 600 : 400,
      }),
      card: { border: '1px solid ' + C.border, borderRadius: 10, padding: '14px 16px', marginBottom: 12, background: C.bg, width: '100%', boxSizing: 'border-box' },
      btn: { border: '1px solid ' + C.border, borderRadius: 8, background: C.bg, padding: '5px 12px', cursor: 'pointer', color: C.text, fontSize: 12 },
      btnPri: { border: '1px solid ' + C.brand, borderRadius: 8, background: C.brand, color: '#fff', padding: '6px 14px', cursor: 'pointer', fontSize: 13 },
      input: { border: '1px solid ' + C.border, borderRadius: 8, padding: '6px 10px', fontSize: 13, color: C.text, background: C.bg, outline: 'none' },
      th: { textAlign: 'center', padding: '5px 6px', borderBottom: '1px solid ' + C.border, fontSize: 12, fontWeight: 600 },
      td: { textAlign: 'center', padding: '4px 6px', fontSize: 12 },
      kpi: { display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 12 },
      kpiItem: { fontSize: 12, color: C.muted },
      kpiNum: { fontSize: 20, fontWeight: 700, color: C.text },
      pre: { whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.7, maxHeight: 420, overflow: 'auto', background: 'rgba(127,127,127,0.06)', borderRadius: 8, padding: '10px 12px' },
      row: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 },
      entry: { border: '1px solid ' + C.border, borderRadius: 8, padding: '10px 12px', marginBottom: 8, background: C.bg, width: '100%', boxSizing: 'border-box' },
      entryHead: { display: 'flex', justifyContent: 'space-between', gap: 10, cursor: 'pointer' },
      entryName: { fontWeight: 600, fontSize: 13 },
      tag: { fontSize: 11, color: C.muted },
    }

    async function post(path, body) {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body || {}),
      })
      const data = await res.json().catch(() => ({}))
      if (!data || data.ok !== true) throw new Error((data && data.error && data.error.message) || ('接口返回异常 ' + res.status))
      return data.value
    }

    function downloadText(filename, text) {
      try {
        const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        setTimeout(() => URL.revokeObjectURL(url), 3000)
      } catch { /* 忽略 */ }
    }

    function extractQuestions(text) {
      const parts = String(text || '').split(/\n(?=##\s)/)
      const out = []
      for (const part of parts) {
        const m = part.match(/^##\s+(.+?)\s*\n([\s\S]*)$/)
        if (!m) continue
        const title = m[1].trim()
        let body = m[2]
        const cut = body.search(/参考答案\s*[:：]|考点分析\s*[:：]|答题思路\s*[:：]/)
        if (cut >= 0) body = body.slice(0, cut)
        const qi = body.search(/题目\s*[:：]/)
        const question = qi >= 0 ? body.slice(qi).replace(/^题目\s*[:：]\s*/, '').trim() : body.trim()
        if (title || question) out.push({ title, question })
      }
      return out
    }

    function copyText(text) {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text)
          return
        }
      } catch { /* 忽略 */ }
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy') } catch { /* 忽略 */ }
      document.body.removeChild(ta)
    }

    function Icon({ size }) {
      const s = typeof size === 'number' ? size : 20
      return h('svg', { viewBox: '0 0 64 64', width: s, height: s, 'aria-hidden': true },
        h('rect', { width: 64, height: 64, rx: 14, fill: '#0f172a' }),
        h('rect', { x: 10, y: 40, width: 9, height: 14, rx: 2, fill: '#1f6feb', opacity: 0.5 }),
        h('rect', { x: 23, y: 30, width: 9, height: 24, rx: 2, fill: '#1f6feb', opacity: 0.7 }),
        h('rect', { x: 36, y: 20, width: 9, height: 34, rx: 2, fill: '#1f6feb', opacity: 0.85 }),
        h('rect', { x: 49, y: 12, width: 9, height: 42, rx: 2, fill: '#1f6feb' }))
    }

    function loadHook(fetcher, deps) {
      const [state, setState] = React.useState({ loading: true, data: null, error: '' })
      React.useEffect(() => {
        let alive = true
        fetcher()
          .then((data) => { if (alive) setState({ loading: false, data, error: '' }) })
          .catch((err) => { if (alive) setState({ loading: false, data: null, error: String(err && err.message ? err.message : err) }) })
        return () => { alive = false }
      }, deps || [])
      return state
    }

    function heatStyle(v, max) {
      if (!v) return { color: C.muted }
      const a = Math.min(0.9, 0.12 + (v / Math.max(max, 1)) * 0.75)
      return { background: 'rgba(31,111,235,' + a.toFixed(2) + ')', color: a > 0.55 ? '#fff' : C.text }
    }

    function SummaryTab() {
      const sum = loadHook(() => post('api/bnu434/summary'))
      const papers = loadHook(() => post('api/bnu434/papers'))
      const [year, setYear] = usePersistent('year', '2022')
      const [open, setOpen] = usePersistent('libOpen', {})
      const [copied, setCopied] = React.useState('')

      if (sum.loading || papers.loading) return h('div', { style: S.card }, '加载中…')
      if (sum.error) return h('div', { style: S.card }, '加载失败：' + sum.error)
      const d = sum.data || {}
      const entries = (papers.data && papers.data.entries) || []
      const years = Array.from(new Set(entries.map((e) => e.year))).sort((a, b) => a - b)
      const chips = years.map(String).concat(['all'])

      const chipRow = h('div', { style: { ...S.row, marginBottom: 4 } },
        h('span', { style: { fontSize: 12, color: C.muted } }, '年份'),
        chips.map((y) => h('button', {
          key: y,
          style: y === year
            ? { ...S.btn, background: C.brand, color: '#fff', borderColor: C.brand }
            : S.btn,
          onClick: () => setYear(y),
        }, y === 'all' ? '全部（热力图与统计）' : y + ' 年')))

      if (year !== 'all') {
        const list = entries.filter((e) => String(e.year) === String(year))
          .sort((a, b) => {
            const order = { 名词解释: 0, 简答题: 1, 论述题: 2, 案例题: 3 }
            const qa = order[a.qtype] === undefined ? 9 : order[a.qtype]
            const qb = order[b.qtype] === undefined ? 9 : order[b.qtype]
            if (qa !== qb) return qa - qb
            return String(a.no).localeCompare(String(b.no), 'zh')
          })
        const copyItem = (e) => [
          e.year + ' 年 ' + e.qtype + ' ' + e.no + '（' + e.score + '分）',
          '题目：' + e.stem,
          '参考答案：' + e.answer,
          '考点分析：' + e.analysis,
          '答题思路：' + e.approach,
        ].join('\n')
        return h('div', null,
          chipRow,
          h('div', { style: { ...S.card, marginTop: 8 } },
            h('div', { style: { fontSize: 12, color: C.muted } },
              year + ' 年真题：共 ' + list.length + ' 个设问' + (Number(year) <= 2021 ? '（旧版式）' : '（现行版式）')),
            list.map((e) => h('div', { key: e.id, style: { ...S.entry, marginTop: 8 } },
              h('div', { style: S.entryHead, onClick: () => setOpen((o) => ({ ...o, [e.id]: !o[e.id] })) },
                h('div', null,
                  h('div', { style: S.entryName }, e.qtype + ' ' + e.no + '（' + e.score + '分）'),
                  h('div', { style: S.tag }, e.stem.length > 70 ? e.stem.slice(0, 70) + '…' : e.stem)),
                h('span', { style: { fontSize: 12, color: C.muted } }, open[e.id] ? '收起' : '展开答案')),
              open[e.id] ? h('div', { style: { marginTop: 8 } },
                h('div', { style: { fontSize: 13 } }, h('b', null, '题目：'), e.stem),
                h('div', { style: { fontSize: 13, marginTop: 6, fontWeight: 600 } }, '参考答案'),
                h('div', { style: { fontSize: 13, whiteSpace: 'pre-wrap' } }, e.answer),
                h('div', { style: { fontSize: 13, marginTop: 6, fontWeight: 600 } }, '考点分析'),
                h('div', { style: { fontSize: 13, whiteSpace: 'pre-wrap' } }, e.analysis),
                h('div', { style: { fontSize: 13, marginTop: 6, fontWeight: 600 } }, '答题思路'),
                h('div', { style: { fontSize: 13, whiteSpace: 'pre-wrap' } }, e.approach),
                h('button', {
                  style: { ...S.btn, marginTop: 8 },
                  onClick: () => { copyText(copyItem(e)); setCopied(e.id); setTimeout(() => setCopied(''), 1500) },
                }, copied === e.id ? '已复制' : '复制本题')) : null))
          ))
      }

      const chapters = d.chapters || {}
      const heat = d.heat || {}
      const heatYears = d.years || []
      const rows = Object.keys(chapters).map((k) => ({ ch: Number(k), total: chapters[k], cells: heat[k] || {} }))
        .sort((a, b) => b.total - a.total)
      const max = rows.length ? rows[0].total : 1
      const total = rows.reduce((s, r) => s + r.total, 0)
      const repeat = Math.round((d.repeatRate || 0) * 1000) / 10
      return h('div', null,
        chipRow,
        h('div', { style: S.kpi },
          h('div', { style: S.kpiItem }, h('div', { style: S.kpiNum }, total), '五年合计（分）'),
          h('div', { style: S.kpiItem }, h('div', { style: S.kpiNum }, repeat + '%'), '考点重复率'),
          h('div', { style: S.kpiItem }, h('div', { style: S.kpiNum }, (d.candidates || []).length), '2027 候补')),
        h('div', { style: S.card },
          h('div', { style: { fontWeight: 600, marginBottom: 6 } }, '考纲章分值热力（五年合计由高到低）'),
          h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
            h('thead', null, h('tr', null,
              h('th', { style: { ...S.th, textAlign: 'left' } }, '考纲章'),
              heatYears.map((y) => h('th', { key: y, style: S.th }, y)),
              h('th', { style: S.th }, '合计'))),
            h('tbody', null, rows.map((r) => h('tr', { key: r.ch },
              h('td', { style: { ...S.td, textAlign: 'left' } }, r.ch + ' ' + (d.chapterNames || {})[r.ch]),
              heatYears.map((y) => h('td', { key: y, style: { ...S.td, ...heatStyle(r.cells[y] || 0, max) } }, r.cells[y] || '')),
              h('td', { style: { ...S.td, fontWeight: 600 } }, r.total)))))) ,
        h('div', { style: S.card },
          h('div', { style: { fontWeight: 600, marginBottom: 6 } }, '2027 候补排序（统计推断，非押题）'),
          (d.candidates || []).map((c, i) => h('div', { key: c.tag, style: { fontSize: 12, lineHeight: 2 } },
            (i + 1) + '. ' + c.tag + '　章' + c.ch + '　最近 ' + c.last + '　得分 ' + c.score))),
        h('div', { style: S.card },
          h('div', { style: { fontSize: 12, color: C.muted, marginBottom: 6 } }, '完整报告：' + (d.reportPath || '')),
          h('button', { style: S.btn, onClick: () => copyText(d.reportPath || '') }, '复制报告路径')))
    }

    function ChapterPicker({ chapters, setChapters }) {
      const toggle = (c) => setChapters((old) => old.includes(c) ? old.filter((x) => x !== c) : [...old, c].sort((a, b) => a - b))
      return h('div', { style: { ...S.row, marginBottom: 8 } },
        h('span', { style: { fontSize: 12, color: C.muted } }, '章节'),
        h('button', { style: chapters.length ? S.btn : { ...S.btn, borderColor: C.brand, color: C.brand }, onClick: () => setChapters([]) }, '全部'),
        Array.from({ length: 15 }, (_, i) => i + 1).map((c) => h('button', {
          key: c,
          style: chapters.includes(c) ? { ...S.btn, background: C.brand, color: '#fff', borderColor: C.brand } : { ...S.btn, padding: '4px 8px' },
          onClick: () => toggle(c),
        }, String(c))))
    }

    function DrillTab() {
      const [chapters, setChapters] = usePersistent('chapters', [])
      const [seed, setSeed] = usePersistent('seed', '')
      const [count, setCount] = usePersistent('drillCount', 10)
      const [loading, setLoading] = React.useState(false)
      const [error, setError] = React.useState('')
      const [drill, setDrill] = usePersistent('drill', null)
      const [idx, setIdx] = usePersistent('drillIdx', 0)
      const [showAnswer, setShowAnswer] = usePersistent('drillShowAnswer', false)
      const [marked, setMarked] = React.useState(() => {
        try { return JSON.parse(localStorage.getItem('bnu434-drill-marked') || '{}') } catch { return {} }
      })
      const start = () => {
        setLoading(true); setError(''); setDrill(null); setIdx(0); setShowAnswer(false)
        post('api/bnu434/drill', { chapters, mingjie: Number(count) || 10, seed: seed === '' ? undefined : Number(seed) })
          .then((v) => setDrill(v))
          .catch((e) => setError(String(e && e.message ? e.message : e)))
          .finally(() => setLoading(false))
      }
      const mark = (id, val) => {
        const next = { ...marked, [id]: val }
        setMarked(next)
        try { localStorage.setItem('bnu434-drill-marked', JSON.stringify(next)) } catch { /* 忽略 */ }
      }
      const card = () => {
        if (!drill || !drill.items || !drill.items.length) return null
        const it = drill.items[idx]
        const total = drill.items.length
        return h('div', { style: S.card },
          h('div', { style: { fontSize: 12, color: C.muted, marginBottom: 6 } },
            '抽背 ' + (idx + 1) + ' / ' + total + '｜第' + it.chapter + '章 ' + (it.chapter_name || '')),
          h('div', { style: { fontSize: 16, fontWeight: 600, marginBottom: 8 } }, it.stem),
          !showAnswer
            ? h('button', { style: S.btnPri, onClick: () => setShowAnswer(true) }, '显示答案')
            : h('div', null,
              h('div', { style: { fontSize: 13, whiteSpace: 'pre-wrap', marginTop: 6 } }, it.answer),
              h('div', { style: { ...S.row, marginTop: 10 } },
                h('button', { style: S.btn, onClick: () => { mark(it.entry.id, 'yes'); if (idx + 1 < total) { setIdx(idx + 1); setShowAnswer(false) } } }, marked[it.entry.id] === 'yes' ? '已记住' : '记住了'),
                h('button', { style: S.btn, onClick: () => { mark(it.entry.id, 'no'); if (idx + 1 < total) { setIdx(idx + 1); setShowAnswer(false) } } }, marked[it.entry.id] === 'no' ? '已标记没记住' : '没记住'),
                h('button', { style: S.btn, onClick: () => copyText(it.stem + '\n\n' + it.answer) }, '复制题与答案'))),
          h('div', { style: { ...S.row, marginTop: 8 } },
            h('button', { style: S.btn, disabled: idx === 0, onClick: () => { setIdx(Math.max(0, idx - 1)); setShowAnswer(false) } }, '上一题'),
            h('button', { style: S.btn, disabled: idx + 1 >= total, onClick: () => { setIdx(Math.min(total - 1, idx + 1)); setShowAnswer(false) } }, '下一题')))
      }
      return h('div', null,
        h('div', { style: S.card },
          h('div', { style: { fontSize: 12, color: C.muted, marginBottom: 8 } }, '离线抽知识点，答案即资料库内容（要点版），不调用模型。'),
          h(ChapterPicker, { chapters, setChapters }),
          h('div', { style: S.row },
            h('span', { style: { fontSize: 12, color: C.muted } }, '题量'),
            h('input', { style: { ...S.input, width: 70 }, type: 'number', value: count, onChange: (e) => setCount(e.target.value) }),
            h('span', { style: { fontSize: 12, color: C.muted } }, 'seed'),
            h('input', { style: { ...S.input, width: 110 }, value: seed, placeholder: '可留空', onChange: (e) => setSeed(e.target.value) }),
            h('button', { style: S.btnPri, onClick: start, disabled: loading }, loading ? '抽取中…' : '开始抽背')),
          h('div', { style: { fontSize: 12, color: C.muted, marginTop: 6 } },
            '已标记：记住 ' + Object.values(marked).filter((v) => v === 'yes').length + ' 条｜没记住 ' + Object.values(marked).filter((v) => v === 'no').length + ' 条（存在本机浏览器）')),
        error ? h('div', { style: { ...S.card, color: 'var(--dsw-alias-text-danger, #b42318)' } }, '出错了：' + error) : null,
        card())
    }

    function ExamTab() {
      const [examMode, setExamMode] = usePersistent('examMode', 'offline')
      const [chapters, setChapters] = usePersistent('chapters', [])
      const [seed, setSeed] = usePersistent('seed', '')
      const [mingjie, setMingjie] = usePersistent('mingjie', 4)
      const [jianda, setJianda] = usePersistent('jianda', 4)
      const [lunshu, setLunshu] = usePersistent('lunshu', 2)
      const [offlineLoading, setOfflineLoading] = React.useState(false)
      const [offlineExam, setOfflineExam] = usePersistent('offlineExam', null)
      const [aiLoading, setAiLoading] = usePersistent('aiLoading', false)
      const [aiText, setAiText] = usePersistent('aiText', '')
      const [aiItems, setAiItems] = usePersistent('aiItems', [])
      const [aiOpen, setAiOpen] = usePersistent('aiOpen', {})
      const [aiError, setAiError] = usePersistent('aiError', '')
      const [jobId, setJobId] = usePersistent('aiJobId', '')
      const [aiSeed, setAiSeed] = usePersistent('aiSeed', '')
      const [savedPath, setSavedPath] = usePersistent('savedPath', '')

      React.useEffect(() => {
        if (!jobId) return undefined
        let alive = true
        const timer = setInterval(async () => {
          try {
            const v = await post('api/bnu434/exam/status', { jobId })
            if (!alive) return
            if (v.status === 'running') {
              if (v.text) setAiText(v.text)
            } else if (v.status === 'done') {
              setAiText(v.text || '')
              setAiItems(Array.isArray(v.items) ? v.items : [])
              setAiLoading(false)
              setJobId('')
              clearInterval(timer)
            } else if (v.status === 'error') {
              setAiError(v.error || 'AI 生成失败')
              setAiLoading(false)
              setJobId('')
              clearInterval(timer)
            } else if (v.status === 'missing') {
              setAiError('任务已失效，请重新生成')
              setAiLoading(false)
              setJobId('')
              clearInterval(timer)
            }
          } catch { /* 下次再试 */ }
        }, 1200)
        return () => { alive = false; clearInterval(timer) }
      }, [jobId])

      const baseBody = () => ({
        chapters,
        seed: seed === '' ? undefined : Number(seed),
        mingjie: Number(mingjie), jianda: Number(jianda), lunshu: Number(lunshu),
      })

      const generateOffline = () => {
        setOfflineLoading(true)
        setOfflineExam(null)
        post('api/bnu434/exam', { ...baseBody(), mode: 'offline' })
          .then((v) => setOfflineExam(v))
          .catch((e) => alert('离线生成失败：' + String(e && e.message ? e.message : e)))
          .finally(() => setOfflineLoading(false))
      }
      const generateAi = () => {
        setAiLoading(true)
        setAiError('')
        setAiText('')
        setAiItems([])
        setAiOpen({})
        post('api/bnu434/exam', { ...baseBody(), mode: 'ai' })
          .then((v) => {
            if (v.mode === 'ai' && v.jobId) { setJobId(v.jobId); setAiSeed(v.seed || '') }
            else { setAiError('接口未返回任务号'); setAiLoading(false) }
          })
          .catch((e) => { setAiError(String(e && e.message ? e.message : e)); setAiLoading(false) })
      }

      const offlineView = () => {
        if (!offlineExam) return null
        return h('div', { style: S.card },
          h('div', { style: S.row },
            h('div', { style: { fontSize: 12, color: C.muted } },
              '离线模考卷：' + (offlineExam.totalScore || 0) + ' 分｜seed ' + offlineExam.seed),
            h('button', { style: S.btn, onClick: () => copyText(offlineMarkdown()) }, '复制全文'),
            h('button', { style: S.btn, onClick: () => downloadText('434离线模考_' + offlineExam.seed + '.md', offlineMarkdown()) }, '导出 Markdown'),
            h('button', { style: S.btn, onClick: () => saveLocal('434离线模考_' + offlineExam.seed + '.md', offlineMarkdown()) }, savedPath ? '已保存' : '保存到本地')),
          savedPath ? h('div', { style: { fontSize: 12, color: C.muted, margin: '6px 0' } }, '已保存到：' + savedPath) : null,
          (offlineExam.items || []).map((it) => h('div', { key: it.no, style: { borderTop: '1px solid ' + C.border, paddingTop: 8, marginTop: 8 } },
            h('div', { style: { fontSize: 13, fontWeight: 600 } }, it.type + ' ' + it.no + '（' + it.score + '分）'),
            h('div', { style: { fontSize: 13, whiteSpace: 'pre-wrap', marginTop: 4 } }, it.stem),
            h('details', { style: { marginTop: 6 } },
              h('summary', { style: { fontSize: 12, cursor: 'pointer', color: C.brand } }, '展开要点版答案'),
              h('div', { style: { fontSize: 13, whiteSpace: 'pre-wrap', marginTop: 6 } }, it.answer)))))
      }
      const saveLocal = (filename, content) => {
        post('api/bnu434/save', { filename, content })
          .then((v) => setSavedPath(v.path || '已保存'))
          .catch((e) => alert('保存失败：' + String(e && e.message ? e.message : e)))
      }
      const offlineMarkdown = () => {
        if (!offlineExam) return ''
        const lines = ['# BNU434 离线模考卷（' + (offlineExam.totalScore || 0) + ' 分，seed ' + offlineExam.seed + '）', '']
        ;(offlineExam.items || []).forEach((it) => {
          lines.push('## ' + it.type + ' ' + it.no + '（' + it.score + '分）')
          lines.push('题目：' + it.stem)
          lines.push(it.answer)
          lines.push('')
        })
        return lines.join('\n')
      }
      const aiCard = (it, i) => {
        const isOpen = !!aiOpen[i]
        const copyOne = () => copyText(it.title + '\n题目：' + it.question + '\n参考答案：' + it.answer +
          (it.analysis ? '\n考点分析：' + it.analysis : '') + (it.approach ? '\n答题思路：' + it.approach : ''))
        return h('div', { key: i, style: { ...S.entry, marginTop: 8 } },
          h('div', { style: S.entryHead, onClick: () => setAiOpen((o) => ({ ...o, [i]: !o[i] })) },
            h('div', null,
              h('div', { style: S.entryName }, it.title),
              h('div', { style: { fontSize: 13, marginTop: 4 } }, it.question)),
            h('span', { style: { fontSize: 12, color: C.muted } }, isOpen ? '收起答案' : '展开答案')),
          isOpen ? h('div', { style: { marginTop: 8 } },
            h('div', { style: { fontSize: 13, fontWeight: 600 } }, '参考答案'),
            h('div', { style: { fontSize: 13, whiteSpace: 'pre-wrap' } }, it.answer || '（未解析到）'),
            it.analysis ? h('div', { style: { fontSize: 13, marginTop: 6, fontWeight: 600 } }, '考点分析') : null,
            it.analysis ? h('div', { style: { fontSize: 13, whiteSpace: 'pre-wrap' } }, it.analysis) : null,
            it.approach ? h('div', { style: { fontSize: 13, marginTop: 6, fontWeight: 600 } }, '答题思路') : null,
            it.approach ? h('div', { style: { fontSize: 13, whiteSpace: 'pre-wrap' } }, it.approach) : null,
            h('button', { style: { ...S.btn, marginTop: 8 }, onClick: copyOne }, '复制本题')
          ) : null)
      }
      const aiView = () => {
        if (aiError) return h('div', { style: { ...S.card, color: 'var(--dsw-alias-text-danger, #b42318)' } }, 'AI 失败：' + aiError)
        if (aiItems.length) {
          return h('div', { style: S.card },
            h('div', { style: S.row },
              h('div', { style: { fontWeight: 600 } }, 'AI 生成结果（点击题目看答案）'),
              h('button', { style: S.btn, onClick: () => copyText(aiText) }, '复制全文'),
              h('button', { style: S.btn, onClick: () => downloadText('434模拟卷_' + (aiSeed || 'ai') + '.md', aiText) }, '导出 Markdown'),
              h('button', { style: S.btn, onClick: () => saveLocal('434模拟卷_' + (aiSeed || 'ai') + '.md', aiText) }, savedPath ? '已保存' : '保存到本地')),
            aiItems.map(aiCard),
            savedPath ? h('div', { style: { fontSize: 12, color: C.muted, marginTop: 8 } }, '已保存到：' + savedPath) : null)
        }
        if (aiLoading && aiText) {
          const qs = extractQuestions(aiText)
          return h('div', { style: S.card },
            h('div', { style: { fontWeight: 600, marginBottom: 6 } }, 'AI 生成中：题目已出，答案生成完成后按题查看'),
            qs.length
              ? qs.map((q, i) => h('div', { key: i, style: { borderTop: '1px solid ' + C.border, paddingTop: 8, marginTop: 8 } },
                h('div', { style: S.entryName }, q.title || ('第' + (i + 1) + '题')),
                h('div', { style: { fontSize: 13, marginTop: 4, whiteSpace: 'pre-wrap' } }, q.question || '题目生成中…')))
              : h('div', { style: { fontSize: 12, color: C.muted } }, '正在生成题目…'),
            h('div', { style: { fontSize: 12, color: C.muted, marginTop: 10 } }, '答案暂不显示，避免影响模考；全部完成后每道题点开即可看答案。'))
        }
        if (aiText && !aiLoading) {
          return h('div', { style: S.card },
            h('div', { style: S.row },
              h('div', { style: { fontWeight: 600 } }, 'AI 原始输出（未能拆分逐题，点“复制全文”保存）'),
              h('button', { style: S.btn, onClick: () => copyText(aiText) }, '复制全文')),
            h('pre', { style: S.pre }, aiText))
        }
        if (aiLoading) return h('div', { style: S.card }, 'AI 生成中…先出题目，随后逐步输出答案。通常需要 1—5 分钟，可以切到其他标签或工作区继续用。')
        return null
      }

      return h('div', null,
        h('div', { style: S.card },
          h('div', { style: S.row },
            h('span', { style: { fontSize: 12, color: C.muted } }, '模式'),
            h('button', { style: examMode === 'offline' ? S.btnPri : S.btn, onClick: () => setExamMode('offline') }, '离线要点版'),
            h('button', { style: examMode === 'ai' ? S.btnPri : S.btn, onClick: () => setExamMode('ai') }, '在线 AI 完整版')),
          h('div', { style: { fontSize: 12, color: C.muted, marginTop: 6, marginBottom: 8 } },
            examMode === 'ai' ? '随机抽题＋内置热点，套用封装提示词，由当前 DSH 模型生成完整试卷与答案（通常 1—5 分钟，后台生成，不阻塞其他功能）。' : '随机出整卷，答案直接来自资料库要点，秒出、零成本。'),
          h(ChapterPicker, { chapters, setChapters }),
          h('div', { style: S.row },
            h('span', { style: { fontSize: 12, color: C.muted } }, '名解'),
            h('input', { style: { ...S.input, width: 54 }, type: 'number', value: mingjie, onChange: (e) => setMingjie(e.target.value) }),
            h('span', { style: { fontSize: 12, color: C.muted } }, '简答'),
            h('input', { style: { ...S.input, width: 54 }, type: 'number', value: jianda, onChange: (e) => setJianda(e.target.value) }),
            h('span', { style: { fontSize: 12, color: C.muted } }, '论述'),
            h('input', { style: { ...S.input, width: 54 }, type: 'number', value: lunshu, onChange: (e) => setLunshu(e.target.value) }),
            h('span', { style: { fontSize: 12, color: C.muted } }, 'seed'),
            h('input', { style: { ...S.input, width: 100 }, value: seed, placeholder: '可留空', onChange: (e) => setSeed(e.target.value) }),
            examMode === 'offline'
              ? h('button', { style: S.btnPri, onClick: generateOffline, disabled: offlineLoading }, offlineLoading ? '生成中…' : '生成试卷')
              : h('button', { style: S.btnPri, onClick: generateAi, disabled: aiLoading }, aiLoading ? 'AI 生成中…' : '生成完整答案'))),
        examMode === 'offline' ? offlineView() : aiView())
    }

    function LibraryTab() {
      const st = loadHook(() => post('api/bnu434/knowledge'))
      const [q, setQ] = usePersistent('libQ', '')
      const [ch, setCh] = usePersistent('libCh', '')
      const [level, setLevel] = usePersistent('libLevel', '')
      const [open, setOpen] = usePersistent('libOpen', {})
      const [copied, setCopied] = React.useState('')
      if (st.loading) return h('div', { style: S.card }, '加载中…')
      if (st.error) return h('div', { style: S.card }, '加载失败：' + st.error)
      const rows = (st.data && st.data.entries) || []
      const filtered = rows.filter((r) => {
        if (ch && r.chapter !== Number(ch)) return false
        if (level && !String(r.level || '').startsWith(level)) return false
        if (!q) return true
        const t = [r.name, r.summary, (r.outline || []).join(' '), r.key_points, r.exam_analysis].join(' ')
        return t.includes(q.trim())
      })
      const display = filtered.slice(0, 120)
      const entryText = (r) => [
        r.name,
        '定义：' + r.summary,
        '提纲：',
        ...(r.outline || []).map((x) => '- ' + x),
        '要点：' + r.key_points,
        '真题考法：' + r.exam_analysis,
      ].join('\n')
      return h('div', null,
        h('div', { style: S.card },
          h('div', { style: S.row },
            h('input', { style: { ...S.input, flex: '1 1 220px' }, placeholder: '搜索知识点，如 乌普萨拉、五力、区域一体化', value: q, onChange: (e) => setQ(e.target.value) }),
            h('select', { style: S.input, value: ch, onChange: (e) => setCh(e.target.value) },
              h('option', { value: '' }, '全部章节'),
              Array.from({ length: 15 }, (_, i) => i + 1).map((c) => h('option', { key: c, value: String(c) }, '第' + c + '章'))),
            h('select', { style: S.input, value: level, onChange: (e) => setLevel(e.target.value) },
              h('option', { value: '' }, '全部层级'),
              h('option', { value: '★' }, '★ 核心必背'),
              h('option', { value: '○' }, '○ 次重点'),
              h('option', { value: '·' }, '· 了解即可'))),
          h('div', { style: { fontSize: 12, color: C.muted, marginTop: 6 } },
            '共 ' + rows.length + ' 条，筛选出 ' + filtered.length + ' 条' + (filtered.length > display.length ? '（显示前 ' + display.length + ' 条）' : ''),
            h('div', { style: { fontSize: 11, color: C.muted, marginTop: 4 } },
              '层级：★ 核心必背｜○ 次重点｜· 了解即可。章节按考纲 15 章归位，不是教材章号。'))),
        display.map((r) => h('div', { key: r.id, style: S.entry },
          h('div', { style: S.entryHead, onClick: () => setOpen((o) => ({ ...o, [r.id]: !o[r.id] })) },
            h('div', null,
              h('div', { style: S.entryName }, r.name),
              h('div', { style: S.tag }, '第' + r.chapter + '章 ' + (r.chapter_name || '') + '｜' + (r.level || '') + '｜' + (r.source || ''))),
            h('span', { style: { fontSize: 12, color: C.muted } }, open[r.id] ? '收起' : '展开')),
          open[r.id] ? h('div', { style: { marginTop: 8 } },
            h('div', { style: { fontSize: 13 } }, h('b', null, '定义：'), r.summary),
            h('div', { style: { fontSize: 13, marginTop: 4 } }, h('b', null, '提纲：')),
            h('ul', { style: { margin: '4px 0 0 18px', padding: 0, fontSize: 13 } },
              (r.outline || []).map((x, i) => h('li', { key: i }, x))),
            h('div', { style: { fontSize: 13, marginTop: 4 } }, h('b', null, '要点：'), r.key_points),
            h('div', { style: { fontSize: 13, marginTop: 4 } }, h('b', null, '真题考法：'), r.exam_analysis),
            h('button', {
              style: { ...S.btn, marginTop: 8 },
              onClick: () => { copyText(entryText(r)); setCopied(r.id); setTimeout(() => setCopied(''), 1500) },
            }, copied === r.id ? '已复制' : '复制这条')) : null))
      )
    }

    function AboutTab() {
      const block = (title, nodes) => h('div', { style: S.card },
        h('div', { style: { fontWeight: 700, marginBottom: 6 } }, title),
        h('div', { style: { fontSize: 13, lineHeight: 1.9 } }, nodes))
      return h('div', null,
        block('这是给谁用的', [
          '给备考北京师范大学 434 国际商务专硕的同学用的：真题规律、按年份刷题、背知识点、出模拟题，都在一个面板里完成。',
        ]),
        block('怎么用（四个入口）', [
          h('div', null, h('b', null, '真题分析：'), '先看考纲各章五年热力、重复率与 2027 候补排序；再按年份翻 2020—2026 真题，点开看参考答案、考点分析与答题思路。默认停在 2022 年。'),
          h('div', null, h('b', null, '抽背模式：'), '选章节、题量，随机抽知识点；先只出题，点“显示答案”再看资料库要点，可标记记住/没记住，适合碎片时间反复过。'),
          h('div', null, h('b', null, '模考模式：'), '离线版秒出一整卷，答案是要点版；在线 AI 版会调用当前 DSH 模型，按封装提示词生成完整试卷与答案，生成中可先看题目，完成后逐题点开答案。'),
          h('div', null, h('b', null, '资料库：'), '888 条知识点（370 ★、495 ○、23 ·），按章筛选或搜关键词，展开即定义、提纲、要点与真题考法，可直接复制背诵。'),
        ]),
        block('关于在线 AI', [
          '在线 AI 用的是你 DSH 当前配置的模型，不额外收你的 Key；每套约消耗 1—2 万 tokens（约 ¥0.01—0.05），通常 1—5 分钟出完。',
          '生成在后台进行，可以切到其他标签或工作区继续用，回来接着看；AI 内容仅供参考，正式背诵请以教材表述为准。',
        ]),
        block('数据与更新', [
          '真题：2022—2026 现行版式 60 个设问；2020—2021 旧版式 20 个设问。',
          '知识库：当前收录 888 条知识点（370 ★、495 ○、23 条 ·），会继续校对与扩写。',
          '这个项目会持续更新：真题年份、热点库、知识点内容都会陆续加；有需要或发现问题，可以在 DSH 插件页留言，我会尽量回复。',
        ]),
        block('章节与层级说明', [
          h('div', null, h('b', null, '章节怎么来的：'), '这里的 1—15 章是考纲的 15 个知识模块，不是某本教材的章号。我们按考纲把希尔第 13 版（19 章）与王书第五版（11 章）的内容逐条归位，例如希尔第 5—6 章归入考纲第 4 章国际贸易理论与政策，王书第六、七章归入第 10 章战略与组织，希尔第 16 章归入第 12 章生产与供应链；王书没有独立出口进口章，第 11 章以希尔第 15 章为准。'),
          h('div', { style: { marginTop: 6 } }, h('b', null, '层级含义：'), '★ 是真题反复出现、优先背诵的核心考点；○ 是考纲要求、理解记忆为主的次重点；· 是教材边角、了解即可的补充点。当前 370 ★、495 ○、23 ·。'),
          h('div', { style: { marginTop: 6 } }, h('b', null, '后缀与来源：'), '〔总〕总述条目、〔分〕分述条目、〔补〕教材外补充；来源列 希=希尔、王=王书、双=两书共有。层级是我们依据 2022—2026 真题与两书覆盖度做的复习优先级建议，不是官方分类，后续会按反馈调整。'),
        ]),
        block('声明与许可', [
          '统计与候补排序是描述性分析，不是押题；请按考纲全面复习。',
          '内容为个人整理，仅供学习交流，请勿传播或用于商业用途；代码采用 MIT，内容采用 CC BY-NC-SA 4.0。',
          '本插件不包含教材原文、真题全文与他人的付费资料；AI 生成内容需自行核对。',
        ]))
    }

    function Panel() {
      const [tab, setTab] = usePersistent('tab', 'summary')
      const tabs = [['summary', '真题分析'], ['drill', '抽背模式'], ['exam', '模考模式'], ['library', '资料库'], ['about', '说明']]
      return h('div', { style: S.wrap },
        h('h2', { style: S.title }, 'BNU434 真题与模拟题'),
        h('div', { style: S.sub }, '北师大 434 国际商务 · 真题规律、模拟题命题、888 条知识点笔记'),
        h('div', { style: S.tabs }, tabs.map(([k, label]) => h('button', { key: k, style: S.tab(tab === k), onClick: () => setTab(k) }, label))),
        h('div', { style: { display: tab === 'summary' ? 'block' : 'none' } }, h(SummaryTab)),
        h('div', { style: { display: tab === 'drill' ? 'block' : 'none' } }, h(DrillTab)),
        h('div', { style: { display: tab === 'exam' ? 'block' : 'none' } }, h(ExamTab)),
        h('div', { style: { display: tab === 'library' ? 'block' : 'none' } }, h(LibraryTab)),
        h('div', { style: { display: tab === 'about' ? 'block' : 'none' } }, h(AboutTab)))
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        // 主入口：左上角一级侧边栏 + 主页面
        try {
          ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
            name: 'sidebar.panellist', id: 'bnu434', order: 30, label: () => 'BNU434 真题',
          }, (props) => h(Icon, { size: props && typeof props.size === 'number' ? props.size : 20 })))
        } catch { /* 槽位不存在时忽略 */ }
        try {
          ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'bnu434' }, Panel))
        } catch { /* 忽略 */ }
        // 备用入口：设置页
        try {
          ctx.slots.inject('settings.section.icon', () => ctx.slots.register({
            name: 'settings.section.icon', id: 'bnu434', order: 150, label: () => 'BNU434 真题',
          }, (props) => h(Icon, { size: props && typeof props.size === 'number' ? props.size : 20 })))
        } catch { /* 忽略 */ }
        try {
          ctx.slots.inject('settings.section', () => ctx.slots.register({
            name: 'settings.section', id: 'bnu434', order: 150, label: () => 'BNU434 真题',
          }, Panel))
        } catch { /* 忽略 */ }
      },
    }
  },
})
