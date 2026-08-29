import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import EcBarChart from '../../components/EcBarChart'
import { INQUIRY_PICKS, periodOf, type ComparePeriod } from '../../components/EcPeriodPicks'
import { api, extractErrorMessage } from '../../api/client'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'
import { dateText } from '../../utils/dateText'

/**
 * 영업관리 > 출력물 > <b>출하지시서현황</b>.
 *
 * <p>원본은 출하지시서 아래에 <b>입력 · 조회 · 현황</b> 세 화면을 둔다. 우리 메뉴는
 * [출하지시서현황]이 출하지시서 <b>조회 화면</b>을 가리키고 있었다 — 라우트는 있으니
 * ui-check 도 통과했고, 눌러 보면 등록 폼이 달린 조회 화면이 떴다.
 *
 * <p>원본 조건 판 실측(사본 2장):
 *   [구분] 내역 | 집계 | 라인별 · [비교기간] · 일자(직접입력) + 기간 빠른선택 ·
 *   출하지시No. · 출하예정일 · 창고 · 거래처 · 품목 · 정렬기준 · [데이터 보기형식]
 * <p>결과 열: <b>품목명(규격) · 수량 · 창고명 · 거래처명 · 연락처 · 적요</b>.
 * 출하현황과 달리 <b>연락처</b>가 있다 — 지시서는 물건을 보낼 곳에 연락하려고 보는 것이다.
 *
 * <p>대상은 <b>아직 안 나간 출하지시(READY)</b>다. 이미 나간 것은 출하현황이 본다.
 * 여기서까지 완료분을 세면 "보낼 것이 얼마나 남았나" 를 알 수 없다.
 */
interface ShipLine {
  itemId: number
  itemCode: string
  itemName: string
  unit: string
  spec: string | null
  quantity: number
  remark: string | null
}

interface Shipment {
  id: number
  shipNo: string
  partnerName: string
  shipDate: string
  dueDate: string | null
  status: 'READY' | 'SHIPPED' | 'CANCELED'
  statusName: string
  totalQuantity: number
  warehouseName: string | null
  /** 귀속 프로젝트. 서버가 이미 주고 있는데 이 화면이 안 받고 있었다. */
  projectName: string | null
  contact: string | null
  remark: string | null
  lines: ShipLine[]
}

type Mode = '내역' | '집계' | '라인별'
const MODES = ['내역', '집계', '라인별'] as const
const num = (n: number) => n.toLocaleString('ko-KR')

export default function ShipmentOrderStatusPage() {
  /* 원본은 조건 판의 창고·거래처·품목·프로젝트를 모두 코드도움으로 둔다. */
  const pickers = useCondPickers(['warehouses', 'projects', 'partners', 'items'])
  const [rows, setRows] = useState<Shipment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const init = periodOf('금월(~오늘)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [compare, setCompare] = useState<ComparePeriod>('사용안함')
  const [mode, setMode] = useState<Mode>('내역')
  const [view, setView] = useState<'표' | '그래프'>('표')

  const [shipNo, setShipNo] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [warehouse, setWarehouse] = useState('')
  const [partner, setPartner] = useState('')
  /** 원본 출하지시서현황 조건의 [프로젝트]. */
  const [project, setProject] = useState('')
  const [item, setItem] = useState('')

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<Shipment[]>('/shipments')
      setRows(res.data)
      setError('')
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  function reset() {
    const p = periodOf('금월(~오늘)')!
    setFrom(p.from); setTo(p.to); setCompare('사용안함'); setMode('내역'); setView('표')
    setShipNo(''); setDueDate(''); setWarehouse(''); setPartner(''); setProject(''); setItem('')
  }

  const shown = useMemo(() => rows.filter((r) => {
    // 아직 안 나간 지시만. 취소된 것도 뺀다 — 보낼 것이 아니다.
    if (r.status !== 'READY') return false
    if (r.shipDate < from || r.shipDate > to) return false
    if (shipNo && !r.shipNo.includes(shipNo)) return false
    if (dueDate && (r.dueDate ?? '') !== dueDate) return false
    if (warehouse && !(r.warehouseName ?? '').includes(warehouse)) return false
    if (partner && !r.partnerName.includes(partner)) return false
    if (project && !(r.projectName ?? '').includes(project)) return false
    if (item && !r.lines.some((l) => (l.itemCode + ' ' + l.itemName).includes(item))) return false
    return true
  }), [rows, from, to, shipNo, dueDate, warehouse, partner, project, item])

  /** 라인별 — 원본 결과 격자의 단위다. */
  const lines = useMemo(
    () => shown.flatMap((r) => r.lines.map((l) => ({ key: r.id + '-' + l.itemId, r, l }))),
    [shown])

  /** 집계 — 품목 단위로 지시수량을 모은다. */
  const byItem = useMemo(() => {
    const m = new Map<number, {
      itemId: number; name: string; spec: string | null; unit: string; qty: number; count: number
    }>()
    for (const { l } of lines) {
      const cur = m.get(l.itemId)
      if (!cur) {
        m.set(l.itemId, {
          itemId: l.itemId, name: l.itemName, spec: l.spec, unit: l.unit,
          qty: l.quantity, count: 1,
        })
      } else {
        cur.qty += l.quantity
        cur.count += 1
      }
    }
    return [...m.values()].sort((a, b) => b.qty - a.qty)
  }, [lines])

  const totalQty = shown.reduce((n, r) => n + r.totalQuantity, 0)

  /* 원본 [그래프로 보기]. 이 화면이 답하는 질문은 '무엇이 얼마나 밀려 있나' 다. */
  const chartRows = useMemo(() =>
    mode === '집계'
      ? byItem.map((r) => ({ label: r.name, value: r.qty }))
      : shown.map((r) => ({ label: r.shipNo + ' ' + r.partnerName, value: r.totalQuantity })),
    [mode, byItem, shown])

  /** 품목명(규격) — 규격이 없으면 괄호를 붙이지 않는다. 빈 괄호는 자료가 없다는 뜻이 아니다. */
  const itemLabel = (l: ShipLine) => (l.spec ? l.itemName + '(' + l.spec + ')' : l.itemName)

  return (
    <EcListShell
      title="출하지시서현황"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel(화면)' },
      ]}
      help={
        <p style={{ fontSize: 12.5, lineHeight: 1.7 }}>
          아직 나가지 않은 <b>출하지시</b>만 봅니다. 이미 나간 것은 출하현황에서 봅니다.
        </p>
      }
    >
      <EcStatusPanel
        from={from} to={to}
        onPeriod={(r) => { setFrom(r.from); setTo(r.to) }}
        picks={INQUIRY_PICKS}
        modes={MODES} mode={mode} onModeChange={(m) => setMode(m as Mode)}
        compare={compare} onCompareChange={setCompare}
        view={view} onViewChange={setView}
        dateLabel="일자"
      >
        <EcCond label="출하지시No.">
          <input className="ec-input" placeholder="지시번호 일부" value={shipNo}
                 onChange={(e) => setShipNo(e.target.value)} style={{ width: 180 }} />
        </EcCond>
        <EcCond label="출하예정일">
          <input type="date" className="ec-input" value={dueDate}
                 onChange={(e) => setDueDate(e.target.value)} style={{ width: 150 }} />
        </EcCond>
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={200} emptyLabel="전체"
                           value={warehouse} onChange={(v) => setWarehouse(v)}
                           items={pickers.warehouses} />
        </EcCond>
        {/* 원본 출하지시서현황 조건 실측(사본): 구분·일자·출하지시No.·출하예정일·창고·프로젝트·관리항목·거래처·품목. */}
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={200} emptyLabel="전체"
                           value={project} onChange={(v) => setProject(v)}
                           items={pickers.projects} />
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={200} emptyLabel="전체"
                           value={partner} onChange={(v) => setPartner(v)}
                           items={pickers.partners} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={200} emptyLabel="전체"
                           value={item} onChange={(v) => setItem(v)}
                           items={pickers.items} />
        </EcCond>
      </EcStatusPanel>

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        지시 <b style={{ color: '#3c4553' }}>{shown.length}</b>건
        <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
        지시수량 <b style={{ color: '#c07a00', fontSize: 14 }}>{num(totalQty)}</b>
      </div>

      {error && (
        <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>
          {error}
        </p>
      )}

      {view === '그래프' ? (
        <EcBarChart rows={chartRows} unit=" 개" emptyText="아직 나가지 않은 출하지시가 없습니다." />
      ) : mode === '집계' ? (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th>품목명(규격)</th>
              <th style={{ width: 70 }}>단위</th>
              <th style={{ width: 100, textAlign: 'right' }}>지시건수</th>
              <th style={{ width: 130, textAlign: 'right' }}>수량</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : byItem.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : byItem.map((r, i) => (
              <tr key={r.itemId}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td>{r.spec ? r.name + '(' + r.spec + ')' : r.name}</td>
                <td>{r.unit}</td>
                <td style={{ textAlign: 'right' }}>{num(r.count)}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: '#c07a00' }}>{num(r.qty)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
              <td colSpan={4} style={{ textAlign: 'right' }}>합계 ({byItem.length}품목)</td>
              <td style={{ textAlign: 'right', color: '#c07a00' }}>{num(totalQty)}</td>
            </tr>
          </tfoot>
        </table>
      ) : mode === '라인별' ? (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th style={{ width: 150 }}>출하지시No.</th>
              <th style={{ width: 110 }}>출하예정일</th>
              <th>품목명(규격)</th>
              <th style={{ width: 110, textAlign: 'right' }}>수량</th>
              <th style={{ width: 130 }}>창고명</th>
              <th style={{ width: 150 }}>거래처명</th>
              <th style={{ width: 130 }}>연락처</th>
              <th>적요</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : lines.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : lines.map(({ key, r, l }, i) => (
              <tr key={key}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.shipNo}</td>
                <td style={{ fontFamily: 'monospace' }}>{dateText(r.dueDate) || ''}</td>
                <td>{itemLabel(l)}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{num(l.quantity)} {l.unit}</td>
                <td>{r.warehouseName ?? ''}</td>
                <td>{r.partnerName}</td>
                <td style={{ color: r.contact ? undefined : '#c9ced6' }}>{r.contact ?? '—'}</td>
                <td style={{ color: '#8a929c' }}>{l.remark ?? r.remark ?? ''}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
              <td colSpan={4} style={{ textAlign: 'right' }}>합계 ({lines.length}줄)</td>
              <td style={{ textAlign: 'right', color: '#c07a00' }}>
                {num(lines.reduce((n, x) => n + x.l.quantity, 0))}
              </td>
              <td colSpan={4}></td>
            </tr>
          </tfoot>
        </table>
      ) : (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th style={{ width: 150 }}>출하지시No.</th>
              <th style={{ width: 110 }}>일자</th>
              <th style={{ width: 110 }}>출하예정일</th>
              <th>품목명(요약)</th>
              <th style={{ width: 110, textAlign: 'right' }}>수량합계</th>
              <th style={{ width: 130 }}>창고명</th>
              <th style={{ width: 150 }}>거래처명</th>
              <th style={{ width: 130 }}>연락처</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : shown.map((r, i) => (
              <tr key={r.id}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.shipNo}</td>
                <td style={{ fontFamily: 'monospace' }}>{dateText(r.shipDate)}</td>
                <td style={{ fontFamily: 'monospace' }}>{dateText(r.dueDate) || ''}</td>
                <td>
                  {r.lines.length === 0 ? '' : itemLabel(r.lines[0])}
                  {r.lines.length > 1 ? ' 외 ' + (r.lines.length - 1) + '건' : ''}
                </td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: '#c07a00' }}>{num(r.totalQuantity)}</td>
                <td>{r.warehouseName ?? ''}</td>
                <td>{r.partnerName}</td>
                <td style={{ color: r.contact ? undefined : '#c9ced6' }}>{r.contact ?? '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
              <td colSpan={5} style={{ textAlign: 'right' }}>합계 ({shown.length}건)</td>
              <td style={{ textAlign: 'right', color: '#c07a00' }}>{num(totalQty)}</td>
              <td colSpan={3}></td>
            </tr>
          </tfoot>
        </table>
      )}
    </EcListShell>
  )
}
