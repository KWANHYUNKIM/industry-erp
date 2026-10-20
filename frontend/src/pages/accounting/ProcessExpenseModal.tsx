import { Fragment, useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import Modal from '../../components/Modal'
import type { Warehouse } from '../../types/api'

/**
 * 원가생성/수정(E040802) 사전작업 [노무비/경비등록] · 지나간 줄 [사전작업 › 노무비/경비조회] — 2026-10-20 loginaa 실측.
 *
 * <p>원본 창 제목 '노무비/경비', 그 아래 '기준월: 2026/11 ~ 2026/11'. 격자 열 [공정명 · 창고코드 · 창고명 · 노무비 · 경비] —
 * 공정마다 그 공정에 묶인 공장 창고(조립 → 200 제4공장 · 900 제4공장)가 한 줄씩 깔려 있고 금액은 0 이다. 공정이 끝날 때마다
 * '조립 계' 줄(앞 세 칸 묶음 · 700 · 회색 줄무늬), 맨 아래 '합계'. 노무비 · 경비 칸에 바로 쳐 넣고 [저장(F8)] 하면
 * 안내 없이 창이 닫힌다(다시 열면 '조립 | 200 | 제4공장 | 1,000 | 0' · '조립 계 1,000'). 아래 단추는 [저장(F8)] · [닫기].
 * 지나간 줄의 [노무비/경비조회] 는 같은 격자를 칸 없이 보여 주고 [닫기] 하나다.
 *
 * <p>예전 우리 창은 공정 · 창고 · 금액 · 적요를 한 줄씩 골라 [추가] 하는 폼이었다 — 원본에 없는 꼴이라 격자 입력으로 바꿨다.
 * 공정에 묶인 창고가 하나도 없으면(우리 시드가 그렇다) 창고 칸이 빈 한 줄을 깐다 — 그 줄의 금액은 창고 없이(전사 공통) 남는다.
 * 실제원가 계산은 여기 적은 기준월(시작월)의 총액을 표준 작업시간 비율로 품목에 나눠 붙인다.
 */
interface Expense {
  id: number; period: string; processId: number; processName: string
  warehouseId: number | null; laborCost: number; overheadCost: number; remark: string | null
}
interface ProcessRow { id: number; code: string; name: string; active: boolean }
interface Line {
  key: string; processId: number; processName: string
  warehouseId: number | null; warehouseCode: string; warehouseName: string
  expenseId: number | null; labor: string; overhead: string
}

const won = (n: number) => n.toLocaleString('ko-KR')
const num = (s: string) => Number(String(s).replace(/,/g, '')) || 0
const ymText = (m: string) => m.replace('-', '/')

export default function ProcessExpenseModal({ period, endMonth, readOnly = false, onClose }: {
  /** 기준월(원가 기간 시작월, yyyy-MM). 노무비/경비는 이 달로 남는다. */
  period: string
  /** 원가 기간 종료월 — 머리 '기준월: 시작 ~ 종료' 에만 쓴다. */
  endMonth?: string
  /** 지나간 줄 [노무비/경비조회]. */
  readOnly?: boolean
  onClose: () => void
}) {
  const [lines, setLines] = useState<Line[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      try {
        const [e, p, w] = await Promise.all([
          api.get<Expense[]>('/process-expenses', { params: { period } }),
          api.get<ProcessRow[]>('/processes'),
          api.get<Warehouse[]>('/warehouses'),
        ])
        if (!alive) return
        const out: Line[] = []
        for (const proc of p.data.filter((x) => x.active !== false)) {
          const whs = w.data.filter((x) => x.processId === proc.id && x.active !== false)
            .sort((a, b) => a.code.localeCompare(b.code))
          const slots: (Warehouse | null)[] = whs.length > 0 ? whs : [null]
          for (const wh of slots) {
            const ex = e.data.find((x) => x.processId === proc.id && (x.warehouseId ?? null) === (wh?.id ?? null))
            out.push({
              key: `${proc.id}:${wh?.id ?? ''}`, processId: proc.id, processName: proc.name,
              warehouseId: wh?.id ?? null, warehouseCode: wh?.code ?? '', warehouseName: wh?.name ?? '',
              expenseId: ex?.id ?? null, labor: won(ex?.laborCost ?? 0), overhead: won(ex?.overheadCost ?? 0),
            })
          }
        }
        setLines(out)
      } catch (err) {
        if (alive) setError(extractErrorMessage(err))
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [period])

  const setLine = (key: string, f: 'labor' | 'overhead', v: string) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, [f]: v } : l)))

  /** [저장(F8)] — 원본은 저장하면 안내 없이 창을 닫는다. 0 인 새 줄은 만들지 않는다. */
  async function save() {
    setError('')
    try {
      for (const l of lines) {
        const body = { period, processId: l.processId, warehouseId: l.warehouseId, laborCost: num(l.labor), overheadCost: num(l.overhead), remark: null }
        if (l.expenseId != null) await api.put(`/process-expenses/${l.expenseId}`, body)
        else if (body.laborCost !== 0 || body.overheadCost !== 0) await api.post('/process-expenses', body)
      }
      onClose()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  const groups: { name: string; rows: Line[] }[] = []
  for (const l of lines) {
    const g = groups.find((x) => x.name === l.processName && x.rows[0].processId === l.processId)
    if (g) g.rows.push(l); else groups.push({ name: l.processName, rows: [l] })
  }
  const sum = (rows: Line[]) => rows.reduce((a, l) => ({ lab: a.lab + num(l.labor), oh: a.oh + num(l.overhead) }), { lab: 0, oh: 0 })
  const total = sum(lines)

  return (
    <Modal open title="노무비/경비" width={700} error={error} onClose={onClose}>{(
      <div onKeyDown={(e) => { if (e.key === 'F8' && !readOnly) { e.preventDefault(); void save() } }}>
        <div className="mb-[6px]">기준월: {ymText(period)} ~ {ymText(endMonth ?? period)}</div>
        <table className="w-full">
          <thead>
            <tr>
              <th>공정명</th><th>창고코드</th><th>창고명</th>
              <th className="text-right w-[130px]">노무비</th><th className="text-right w-[130px]">경비</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="ec-empty">불러오는 중…</td></tr>
            ) : groups.length === 0 ? (
              <tr><td colSpan={5} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : groups.map((g) => {
              const s = sum(g.rows)
              return (
                <Fragment key={g.rows[0].processId}>
                  {g.rows.map((l) => (
                    <tr key={l.key}>
                      <td>{l.processName}</td><td>{l.warehouseCode}</td><td>{l.warehouseName}</td>
                      <td className="text-right">{readOnly ? l.labor : (
                        <input className="ec-input w-full text-right h-[18px] py-0" aria-label={`${l.processName} ${l.warehouseCode} 노무비`} value={l.labor}
                               onChange={(e) => setLine(l.key, 'labor', e.target.value)} onFocus={(e) => e.target.select()}
                               onBlur={(e) => setLine(l.key, 'labor', won(num(e.target.value)))} />
                      )}</td>
                      <td className="text-right">{readOnly ? l.overhead : (
                        <input className="ec-input w-full text-right h-[18px] py-0" aria-label={`${l.processName} ${l.warehouseCode} 경비`} value={l.overhead}
                               onChange={(e) => setLine(l.key, 'overhead', e.target.value)} onFocus={(e) => e.target.select()}
                               onBlur={(e) => setLine(l.key, 'overhead', won(num(e.target.value)))} />
                      )}</td>
                    </tr>
                  ))}
                  <tr className="font-bold bg-ec-stripe">
                    <td colSpan={3} className="text-center">{g.name} 계</td>
                    <td className="text-right">{won(s.lab)}</td><td className="text-right">{won(s.oh)}</td>
                  </tr>
                </Fragment>
              )
            })}
            {!loading && groups.length > 0 && (
              <tr className="font-bold bg-ec-stripe">
                <td colSpan={3} className="text-center">합계</td>
                <td className="text-right">{won(total.lab)}</td><td className="text-right">{won(total.oh)}</td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="flex gap-[4px] mt-[10px]">
          {!readOnly && <button type="button" className="ec-btn ec-btn-primary" onClick={() => void save()}>저장(F8)</button>}
          <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
        </div>
      </div>
    )}</Modal>
  )
}
