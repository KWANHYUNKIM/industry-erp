import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import EcBarChart from '../../components/EcBarChart'
import { INQUIRY_PICKS, periodOf, type ComparePeriod } from '../../components/EcPeriodPicks'
import { api, extractErrorMessage } from '../../api/client'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'
import { dateText } from '../../utils/dateText'
import { useItemMgmt } from '../../utils/itemMgmtItems'
import { usePartnerManagers } from '../../utils/partnerManagers'

/**
 * 영업관리 > 출력물 > <b>출하지시서현황</b>.
 *
 * <p>원본은 출하지시서 아래에 <b>입력 · 조회 · 현황</b> 세 화면을 둔다. 우리 메뉴는
 * [출하지시서현황]이 출하지시서 <b>조회 화면</b>을 가리키고 있었다 — 라우트는 있으니
 * ui-check 도 통과했고, 눌러 보면 등록 폼이 달린 조회 화면이 떴다.
 *
 * <p>원본 조건 판 실측(2026-09-08, 접힌 줄을 펼쳐 <b>스물둘</b>. 사본에는 열둘뿐이었다):
 *   [구분] 내역 | 집계 | 라인별 · [비교기간] · 일자 · 출하지시No. · 출하예정일 · 창고 ·
 *   프로젝트 · 관리항목 · 거래처 · 품목 · <b>오더관리번호 · 규격 · 담당자 ·
 *   거래처관리담당자 · 진행상태 · 적요 · 작성자</b> · (최종수정자 · 제목 · 사용자지정) ·
 *   적용양식 · 정렬기준 · 데이터 보기형식.
 * <p>결과 열: <b>품목명(규격) · 수량 · 창고명 · 거래처명 · 연락처 · 적요</b>.
 * 출하현황과 달리 <b>연락처</b>가 있다 — 지시서는 물건을 보낼 곳에 연락하려고 보는 것이다.
 *
 * <p><b>[진행상태]를 조건으로 두기 전까지 이 화면은 READY 만 그렸다.</b> 원본은 상태를
 * 고르게 하니 <b>전부</b> 를 그리는 화면이다 — 나간 지시를 아예 안 보여 주면 "지시한 것이
 * 나갔나" 를 여기서 확인할 수가 없었고, 밀린 것만 보는 화면은 <b>미출하현황</b>이 따로 있다.
 * 기본값은 원본과 같이 [전체]다.
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
  /** 근거 주문번호. 원본 조건의 [오더관리번호]다. 직접 등록한 지시면 null. */
  salesOrderNo: string | null
  /** 전표 담당자. 거래처를 맡은 사람([거래처관리담당자])과 다른 사람이다. */
  employeeName: string | null
  createdBy: string | null
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
  /*
   * 2026-09-08 실측으로 드러난 일곱. 값은 전부 응답에 진작 오던 것이라
   * 서버를 고칠 일이 없었다 — 화면이 묻지 않았을 뿐이다.
   */
  const [orderNoCond, setOrderNoCond] = useState('')
  const [specCond, setSpecCond] = useState('')
  const [empCond, setEmpCond] = useState('')
  const [pmgrCond, setPmgrCond] = useState('')
  const [remarkCond, setRemarkCond] = useState('')
  const [authorCond, setAuthorCond] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'READY' | 'SHIPPED' | 'CANCELED'>('ALL')
  /** [거래처관리담당자] — 거래처 마스터에 매인 사람이라 전표 응답에 없다. 이름으로 잇는다. */
  const pmgr = usePartnerManagers()

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<Shipment[]>('/shipments', { params: { from: from || undefined, to: to || undefined } })
      setRows(res.data)
      setError('')
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }
  /*
   * <b>기간을 서버에 보낸다.</b> 조건 판에 [기간]을 물어 놓고 서버에는 아무것도 안 보내
   * 전 기간을 받아 브라우저에서 걸렀다. 기간이 바뀌면 다시 물어본다.
   */
  useEffect(() => { load() }, [from, to])

  function reset() {
    const p = periodOf('금월(~오늘)')!
    setFrom(p.from); setTo(p.to); setCompare('사용안함'); setMode('내역'); setView('표')
    setShipNo(''); setDueDate(''); setWarehouse(''); setPartner(''); setProject(''); setItem('')
    setOrderNoCond(''); setSpecCond(''); setEmpCond(''); setPmgrCond('')
    setRemarkCond(''); setAuthorCond(''); setStatusFilter('ALL')
  }

  /**
   * 원본 [관리항목] — 차례는 [프로젝트] 다음, [거래처] 앞이다(사본 실측).
   * 품목 마스터에 붙는 값이라 출하 전표 응답에는 없다. 그래도 만들 수 있다 —
   * 품목 마스터를 받아 <b>줄의 itemId 로 화면에서 잇는다</b>(판매현황이 먼저 그렇게 했다).
   */
  const mgmt = useItemMgmt()
  const [mgmtCond, setMgmtCond] = useState('')

  const shown = useMemo(() => rows.filter((r) => {
    if (statusFilter !== 'ALL' && r.status !== statusFilter) return false
    if (r.shipDate < from || r.shipDate > to) return false
    if (shipNo && !r.shipNo.includes(shipNo)) return false
    if (dueDate && (r.dueDate ?? '') !== dueDate) return false
    if (warehouse && !(r.warehouseName ?? '').includes(warehouse)) return false
    if (partner && !r.partnerName.includes(partner)) return false
    if (project && !(r.projectName ?? '').includes(project)) return false
    if (item && !r.lines.some((l) => (l.itemCode + ' ' + l.itemName).includes(item))) return false
    if (!mgmt.hits(r.lines.map((l) => l.itemId), mgmtCond)) return false
    if (orderNoCond && (r.salesOrderNo ?? '') !== orderNoCond) return false
    if (specCond && !r.lines.some((l) => (l.spec ?? '') === specCond)) return false
    if (empCond && (r.employeeName ?? '') !== empCond) return false
    if (pmgrCond && pmgr.managerOfName(r.partnerName) !== pmgrCond) return false
    if (remarkCond && !((r.remark ?? '') + ' ' + r.lines.map((l) => l.remark ?? '').join(' ')).includes(remarkCond)) return false
    if (authorCond && (r.createdBy ?? '') !== authorCond) return false
    return true
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }), [rows, from, to, shipNo, dueDate, warehouse, partner, project, item, mgmtCond, mgmt.options,
       orderNoCond, specCond, empCond, pmgrCond, remarkCond, authorCond, statusFilter, pmgr.options])

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
          <b>출하지시</b>를 봅니다. [진행상태]로 아직 안 나간 것만 골라 볼 수 있고,
          밀린 것만 모아 보려면 미출하현황이 따로 있습니다.
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
        {/* 원본 차례: [프로젝트] 다음, [거래처] 앞이다(사본 실측). */}
        <EcCond label="관리항목" pick>
          <CodePickerField label="관리항목" hideLabel width={170} emptyLabel="전체"
                           value={mgmtCond} onChange={setMgmtCond}
                           items={mgmt.options.map((m) => ({ value: m, name: m }))} />
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
        {/*
          원본 차례(2026-09-08 실측): … 품목 · <b>오더관리번호 · 규격 · 담당자 ·
          거래처관리담당자 · 진행상태 · 적요</b> · (문자형식1~5 · 장문형식1) · <b>작성자</b> ·
          (최종수정자 · 제목 · 사용자지정) · 적용양식 · 정렬기준 · 데이터 보기형식.
          출하현황과 달리 [시리얼/로트No.]·[연락처]·[주소]가 없다 — 그쪽은 나간 물건을
          좇는 화면이고 여기는 지시를 보는 화면이다.
        */}
        <EcCond label="오더관리번호" pick>
          <CodePickerField label="오더관리번호" hideLabel width={140} emptyLabel="전체"
                           value={orderNoCond} onChange={setOrderNoCond}
                           items={[...new Set(rows.map((r) => r.salesOrderNo).filter(Boolean) as string[])].sort()
                             .map((n) => ({ value: n, name: n }))} />
        </EcCond>
        <EcCond label="규격" pick>
          <CodePickerField label="규격" hideLabel width={140} emptyLabel="전체"
                           value={specCond} onChange={setSpecCond}
                           items={[...new Set(rows.flatMap((r) => r.lines.map((l) => l.spec)).filter(Boolean) as string[])].sort()
                             .map((n) => ({ value: n, name: n }))} />
        </EcCond>
        <EcCond label="담당자" pick>
          <CodePickerField label="담당자" hideLabel width={140} emptyLabel="전체"
                           value={empCond} onChange={setEmpCond}
                           items={[...new Set(rows.map((r) => r.employeeName).filter(Boolean) as string[])].sort()
                             .map((n) => ({ value: n, name: n }))} />
        </EcCond>
        <EcCond label="거래처관리담당자" pick>
          <CodePickerField label="거래처관리담당자" hideLabel width={150} emptyLabel="전체"
                           value={pmgrCond} onChange={setPmgrCond}
                           items={pmgr.options.map((n) => ({ value: n, name: n }))} />
        </EcCond>
        <EcCond label="진행상태">
          <div className="ec-pills">
            {(['ALL', 'READY', 'SHIPPED', 'CANCELED'] as const).map((s) => (
              <button key={s} type="button" className={'ec-pill no-ec' + (statusFilter === s ? ' active' : '')}
                      onClick={() => setStatusFilter(s)}>
                {s === 'ALL' ? '전체' : s === 'READY' ? '출하지시' : s === 'SHIPPED' ? '출하완료' : '취소'}
              </button>
            ))}
          </div>
        </EcCond>
        <EcCond label="적요">
          <input className="ec-input" value={remarkCond}
                 onChange={(e) => setRemarkCond(e.target.value)} style={{ width: 170 }} />
        </EcCond>
        <EcCond label="작성자" pick>
          <CodePickerField label="작성자" hideLabel width={140} emptyLabel="전체"
                           value={authorCond} onChange={setAuthorCond}
                           items={[...new Set(rows.map((r) => r.createdBy).filter(Boolean) as string[])].sort()
                             .map((n) => ({ value: n, name: n }))} />
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
        <EcBarChart rows={chartRows} unit=" 개" emptyText="출하지시가 없습니다." />
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
                <td style={{ color: r.contact ? undefined : '#c9ced6' }}>{r.contact ?? ''}</td>
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
                <td style={{ color: r.contact ? undefined : '#c9ced6' }}>{r.contact ?? ''}</td>
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
