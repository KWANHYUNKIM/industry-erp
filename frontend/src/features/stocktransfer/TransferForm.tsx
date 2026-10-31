import { useRef, useState } from 'react'
import EcDateField from '../../components/EcDateField'
import CodePickerField from '../../components/codepicker/CodePickerField'
import EcSlipShell from '../../components/EcSlipShell'
import { api, extractErrorMessage } from '../../api/client'
import type { Item, StockRow, StockTransfer as TransferRow, Warehouse } from '../../types/api'
import { ecAlert } from '../../components/EcDialog'
import { SlipHistoryModal, slipHeadLabel } from '../sliphistory/SlipHistoryModal'
import EcGridToolbar, { EcWebUploadButton } from '../../components/EcGridToolbar'
import { useMyItemsPick, MyItemsNote } from '../../components/codepicker/MyItemsButton'
import { todayYmd } from '../../utils/periods'

/** 창고이동 한 줄. 같은 이동번호의 줄들이 전표 한 장이다(서버 V426) — lineNo 는 전표 안 줄 차례. */
export type StockTransfer = TransferRow & { lineNo?: number; createdAt?: string | null; updatedAt?: string | null }
export interface CodeRow { id: number; code: string; name: string }

const num = (n: number) => n.toLocaleString('ko-KR')

/** 원본 이동번호 꼴 '2026/10/21 -2' — 우리 이동번호 TR-20261021-0002 의 날짜와 일련번호. */
export function slipNoText(date: string, no: string) {
  const seq = Number(no.split('-')[2] ?? '')
  return `${date.replaceAll('-', '/')} -${Number.isFinite(seq) && seq > 0 ? seq : no}`
}

/** name — 줄 품목명(null = 품목 이름을 따라감). 원본은 품목을 고른 뒤 이름 칸을 고쳐 쓴다('포장김치1kg'). */
interface SlipLine { itemId: string; quantity: string; reason: string; name: string | null }
const blankLine = (): SlipLine => ({ itemId: '', quantity: '', reason: '', name: null })

/**
 * 창고이동입력 / 창고이동수정 (원본 E040501). 머리: 일자 · 담당자 · 보내는창고 · 받는창고 · 프로젝트,
 * 줄: 품목코드 · 품목명 · 수량 · 적요 — 줄 수는 늘릴 수 있고 빈 줄은 저장하지 않는다.
 * 예전에는 품목 하나에 한 건이라, 다섯 품목을 옮기면 이동번호가 다섯 개 생겼다.
 *
 * <p>page 를 주면 <b>입력 화면</b>(원본 창고이동입력은 창이 아니라 화면 — 수정만 창 '창고이동수정', 2026-10-21 실측)으로 그린다:
 * 아래 단추 저장(F8) · 저장/전표(F7) · 다시 작성 · 리스트 · 웹자료올리기, 저장하면 말 없이 머리는 남기고 줄만 비운다.
 */
export function TransferForm({ slip, onDelete, onPrint, onNav, onCopy, onClose, items, warehouses, stock, projects, employees, error, onError, onSaved, page }: {
  slip: StockTransfer[] | null; onDelete: (r: StockTransfer) => void
  onPrint: (transferNo: string) => void; onNav: (dir: -1 | 1) => void; onCopy: () => void; onClose: () => void
  items: Item[]; warehouses: Warehouse[]; stock: StockRow[]
  projects: CodeRow[]; employees: CodeRow[]
  /** 입력 화면에서 머리 위에 띄울 오류(창일 때는 창이 띄운다). */
  error?: string
  onError: (m: string) => void; onSaved: (msg: string) => void
  page?: { onList: () => void }
}) {
  /* [복사] — 원본은 같은 머리 · 줄을 든 채 입력 창(저장 · 저장/전표 · 다시 작성 · 닫기)으로 바뀐다. 저장하면 새 번호다. */
  const [copied, setCopied] = useState(false)
  const head = copied ? undefined : slip?.[0]
  const [showHistory, setShowHistory] = useState(false)
  const [form, setForm] = useState({
    transferDate: head?.transferDate ?? todayYmd(),
    projectId: head?.projectId ? String(head.projectId) : '',
    employeeId: head?.employeeId ? String(head.employeeId) : '',
    fromWarehouseId: head ? String(head.fromWarehouseId) : '',
    toWarehouseId: head ? String(head.toWarehouseId) : '',
    /** 머리 적요 — 원본 머리 끝 [새로운 항목 추가](stock_transfers.remark). */
    remark: head?.remark ?? '',
  })
  const [lines, setLines] = useState<SlipLine[]>(() => {
    const ls: SlipLine[] = (slip ?? []).map((r) => ({ itemId: String(r.itemId), quantity: String(r.quantity), reason: r.reason ?? '', name: r.itemName ?? null }))
    while (ls.length < 5) ls.push(blankLine())
    return ls
  })
  const tableRef = useRef<HTMLTableElement>(null)
  const myItems = useMyItemsPick((picked) => setLines((ls) => {
    const kept = ls.filter((l) => l.itemId || l.quantity)
    return [...kept, ...picked.map((m) => ({ ...blankLine(), itemId: String(m.itemId) })), blankLine()]
  }))
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))
  /* 품목을 새로 고르면 이름도 품목 이름으로 다시 채운다(원본) */
  const setLine = (i: number, k: keyof SlipLine, v: string) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v, ...(k === 'itemId' ? { name: null } : {}) } : l)))
  const itemOf = (id: string) => items.find((it) => String(it.id) === id)
  const filled = lines.filter((l) => l.itemId || l.quantity)
  const total = filled.reduce((a, l) => a + (Number(l.quantity) || 0), 0)
  const whItems = warehouses.map((w) => ({ value: String(w.id), code: w.code, name: w.name }))

  function reset() {
    setForm({ transferDate: todayYmd(), projectId: '', employeeId: '', fromWarehouseId: form.fromWarehouseId, toWarehouseId: form.toWarehouseId, remark: '' })
    setLines(Array.from({ length: 5 }, blankLine))
  }

  async function submit(andPrint = false) {
    onError('')
    if (!form.fromWarehouseId) return onError('보내는창고를 선택하세요.')
    if (!form.toWarehouseId) return onError('받는창고를 선택하세요.')
    if (form.fromWarehouseId === form.toWarehouseId) return onError('보내는창고와 받는창고가 같을 수 없습니다.')
    if (filled.length === 0) return onError('품목을 한 줄 이상 입력하세요.')
    for (const [i, l] of filled.entries()) {
      if (!l.itemId) return onError(`${i + 1}번째 줄 품목을 선택하세요.`)
      if (!l.quantity || Number(l.quantity) <= 0) return onError(`${i + 1}번째 줄 수량을 입력하세요.`)
    }
    const body = {
      transferDate: form.transferDate,
      fromWarehouseId: Number(form.fromWarehouseId),
      toWarehouseId: Number(form.toWarehouseId),
      projectId: form.projectId ? Number(form.projectId) : undefined,
      employeeId: form.employeeId ? Number(form.employeeId) : undefined,
      lines: filled.map((l) => ({ itemId: Number(l.itemId), quantity: Number(l.quantity), reason: l.reason || undefined, itemName: l.name ?? undefined })),
      remark: form.remark.trim() || null,
    }
    try {
      const res = head
        ? await api.put<StockTransfer[]>(`/stock-transfers/slips/${encodeURIComponent(head.transferNo)}`, body)
        : await api.post<StockTransfer[]>('/stock-transfers/slips', body)
      const r = res.data[0]
      if (andPrint) onPrint(r.transferNo)
      /* 원본 창고이동입력 저장(F8)은 말 없이 머리 창고는 남기고 줄만 비운다(2026-10-21 실측 — plans 재고1 E040501). */
      if (page) setLines(Array.from({ length: 5 }, blankLine))
      /* 원본 창고이동 저장은 말 없이 창이 닫힌다(2026-10-21 실측, plans 재고1 창고이동 ⑤). */
      onSaved('')
    } catch (err) {
      onError(extractErrorMessage(err))
    }
  }

  const body = (
    <>
      {head && (
        <div className="flex justify-end mb-[6px]">
          {/* 원본 창고이동수정 창 머리 오른쪽. 이 회사는 전표상태관리유형 설정으로 막혀 원본도 이 글만 띄운다(2026-10-21 실측). */}
          <button type="button" className="ec-btn ec-btn-sm"
                  onClick={() => void ecAlert('권한이 없습니다. 마스터에게 문의 바랍니다. - 창고이동\n(전표상태관리유형 설정으로 인해 전표상태를 변경할 수 없습니다. ※ Self-Customizing > 환경설정 > 기능설정 > [공통]탭 > 전표상태관리유형)')}>확인취소</button>
        </div>
      )}
      {/* 원본 머리는 2열 고정 — 값을 채워도 칸이 다음 줄로 넘어가지 않는다(.ec-form 은 2열 격자). */}
      <ul className="ec-form mb-[10px]">
        <li>
          <div className="title">일자</div>
          <div className="form"><EcDateField value={form.transferDate} onChange={(v) => set('transferDate', v)} /></div>
        </li>
        <li>
          <div className="title">담당자</div>
          <div className="form">
            <CodePickerField pair label="담당자" hideLabel width={220} placeholder="담당자" emptyLabel="선택 해제"
                             value={form.employeeId} onChange={(v) => set('employeeId', v)}
                             items={employees.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
          </div>
        </li>
        <li>
          <div className="title">보내는창고</div>
          <div className="form">
            <CodePickerField pair label="보내는창고" hideLabel width={220} placeholder="보내는창고" emptyLabel="선택 해제"
                             value={form.fromWarehouseId} onChange={(v) => set('fromWarehouseId', v)} items={whItems} />
          </div>
        </li>
        <li>
          <div className="title">받는창고</div>
          <div className="form">
            <CodePickerField pair label="받는창고" hideLabel width={220} placeholder="받는창고" emptyLabel="선택 해제"
                             value={form.toWarehouseId} onChange={(v) => set('toWarehouseId', v)} items={whItems} />
          </div>
        </li>
        <li>
          <div className="title">프로젝트</div>
          <div className="form">
            <CodePickerField pair label="프로젝트" hideLabel width={220} placeholder="프로젝트" emptyLabel="선택 해제"
                             value={form.projectId} onChange={(v) => set('projectId', v)}
                             items={projects.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
          </div>
        </li>
        <li>
          <div className="title">적요</div>
          <div className="form">
            <input className="ec-input w-full" aria-label="머리 적요" placeholder="새로운 항목 추가" maxLength={500}
                   value={form.remark} onChange={(e) => set('remark', e.target.value)} />
          </div>
        </li>
      </ul>
      {/* 원본 창고이동입력 도구줄(2026-10-21 실측): 찾기(F3) · 정렬 · My품목 · 주문 · 구매 · 생산 · 발주요청 · 재고불러오기 · 바코드 · 전표 바코드 · 검증 · 전표불러오기 */}
      <EcGridToolbar tableRef={tableRef} slipKinds={['주문', '구매', '생산', '발주요청']} onMyItems={myItems.pick} myItemsBusy={myItems.busy}
                     onPull={(pulled) => setLines((ls) => {
                       /* 원본: 고른 전표의 품목 · 수량이 빈 줄 자리에 들어온다(2026-10-30 클릭 대조). */
                       const kept = ls.filter((l) => l.itemId || l.quantity)
                       return [...kept, ...pulled.map((p) => ({ ...blankLine(), itemId: String(p.itemId), quantity: String(p.quantity) })), blankLine()]
                     })}>
        <MyItemsNote note={myItems.note} />
      </EcGridToolbar>
      <table ref={tableRef} className="w-full text-left table-fixed min-w-[960px]">
        <colgroup>
          <col className="w-[34px]" /><col className="w-[260px]" /><col /><col className="w-[100px]" />
          <col className="w-[110px]" /><col className="w-[220px]" /><col className="w-[110px]" />
        </colgroup>
        <thead>
          <tr>
            <th></th>
            <th>품목코드</th>
            <th>품목명</th>
            <th className="text-right">수량</th>
            <th className="text-right">보내는창고 재고</th>
            <th>적요</th>
            <th>새로운 항목 추가</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => {
            const it = itemOf(l.itemId)
            const have = l.itemId && form.fromWarehouseId
              ? stock.find((x) => x.itemId === Number(l.itemId) && x.warehouseId === Number(form.fromWarehouseId))?.quantity ?? 0
              : null
            return (
              <tr key={i} data-line={i + 1}>
                <td className="text-center text-ec-hint">{i + 1}</td>
                <td>
                  <CodePickerField pair label="품목" hideLabel width={220} placeholder="품목코드" emptyLabel="선택 해제"
                                   value={l.itemId} onChange={(v) => setLine(i, 'itemId', v)}
                                   items={items.map((x) => ({ value: String(x.id), code: x.code, name: x.name, alias: x.searchKeyword, sub: x.spec }))} />
                </td>
                {/* 원본: 품목을 고르면 품목명 칸이 글자 칸이 되어 줄마다 이름을 고쳐 쓴다(규격은 뒤에 흐리게). */}
                <td>
                  {it && (
                    <div className="flex items-center gap-[4px]">
                      <input className="ec-input w-full" aria-label={`${i + 1}번째 줄 품목명`} maxLength={200}
                             value={l.name ?? it.name} onChange={(e) => setLine(i, 'name', e.target.value)} />
                      {it.spec && <span className="text-ec-hint whitespace-nowrap">[{it.spec}]</span>}
                    </div>
                  )}
                </td>
                <td>
                  <input className="ec-input text-right w-[90px]" type="number" step="any" aria-label={`${i + 1}번째 줄 수량`}
                         value={l.quantity} onChange={(e) => setLine(i, 'quantity', e.target.value)} />
                </td>
                <td className="text-right text-ec-hint">{have === null ? '' : num(have)}</td>
                <td>
                  <input className="ec-input w-full" type="text" aria-label={`${i + 1}번째 줄 적요`} value={l.reason}
                         onChange={(e) => setLine(i, 'reason', e.target.value)} />
                </td>
                <td />
              </tr>
            )
          })}
          <tr>
            <td colSpan={3} className="text-ec-hint">
              <button type="button" className="ec-btn ec-btn-sm" onClick={() => setLines((ls) => [...ls, blankLine()])}>줄 추가</button>
            </td>
            <td className="text-right font-semibold">{num(total)}</td>
            <td colSpan={3}></td>
          </tr>
        </tbody>
      </table>
    </>
  )

  if (page) {
    return (
      <form onSubmit={(e) => { e.preventDefault(); void submit() }}>
        <EcSlipShell title="창고이동입력"
                     actions={[
                       { label: '저장(F8)', primary: true, submit: true },
                       { label: '저장/전표(F7)', onClick: () => void submit(true) },
                       { label: '다시 작성', onClick: reset },
                       { label: '리스트', onClick: page.onList },
                       /* 원본 아래 줄 끝 [웹자료올리기] — 파일 올리기는 모양만(입력 창의 같은 단추와 같다). */
                       { label: '웹자료올리기' },
                     ]}>
          {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
          <div className="bg-white p-[14px]">{body}</div>
        </EcSlipShell>
      </form>
    )
  }

  return (
    <div className="border border-ec-line border-solid bg-white p-[14px] mb-[8px]">
      {body}
      <EcWebUploadButton />
      {/* 원본 버튼 줄 — 수정: 저장(F8) · 저장/전표(F7) · 복사 · 이전 · 다음 · 닫기 · 삭제 · 보내기 · H / 입력: 저장(F8) · 저장/전표(F7) · 다시 작성 · 닫기 */}
      <div className="flex gap-[4px] mt-[10px] flex-wrap">
        <button className="ec-btn ec-btn-primary" onClick={() => submit()}>저장(F8)</button>
        <button className="ec-btn" onClick={() => submit(true)}>저장/전표(F7)</button>
        {head ? (
          <>
            <button className="ec-btn" onClick={() => { setCopied(true); onCopy() }}>복사</button>
            <button className="ec-btn" onClick={() => onNav(-1)}>이전</button>
            <button className="ec-btn" onClick={() => onNav(1)}>다음</button>
            <button className="ec-btn" onClick={onClose}>닫기</button>
            <button className="ec-btn" onClick={() => onDelete(head)}>삭제</button>
            {/* 바깥 연동(메일 · 메신저로 보내기) — 모양만. */}
            <button className="ec-btn" title="보내기 — 바깥 연동은 아직 없습니다">보내기</button>
            <button className="ec-btn" onClick={() => setShowHistory(true)}>H</button>
          </>
        ) : (
          <>
            <button className="ec-btn" onClick={reset}>다시 작성</button>
            <button className="ec-btn" onClick={onClose}>닫기</button>
          </>
        )}
      </div>
      {/* [H] — 서버가 적은 작업 이력(StockTransferService.HISTORY_TARGET, 전표번호로 연다). */}
      {showHistory && head && (
        <SlipHistoryModal target="STOCK_TRANSFER" docNo={head.transferNo} head={slipHeadLabel(head.transferDate, head.transferNo)}
                          onClose={() => setShowHistory(false)} />
      )}
    </div>
  )
}

/**
 * 창고이동전표(원본 [인쇄] · [저장/전표(F7)] 의 '기본(수정불가)' 양식): 전표번호 · [1 / 1] · 출고처 · DATE · 입고처,
 * 순번 · 품목코드 · 품목명[규격명] · 수량 · 적요, 수량 합 · 인수 인. 버튼 인쇄 · 닫기(Email · Excel 은 바깥 연동 · 파일이라 뺌).
 */
export function SlipPrint({ slip, warehouses, items, onClose }: { slip: StockTransfer[]; warehouses: Warehouse[]; items: Item[]; onClose: () => void }) {
  const h = slip[0]
  const whText = (id: number, name: string) => `${name}(${warehouses.find((w) => w.id === id)?.code ?? ''})`
  const total = slip.reduce((a, r) => a + Number(r.quantity), 0)
  const fix2 = (n: number) => n.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (
    <div>
      <div className="text-center font-bold text-[18px] mb-[8px]">창고이동전표</div>
      <table className="w-full text-left mb-[6px]">
        <tbody>
          <tr><th className="w-[90px]">전표번호</th><td>{slipNoText(h.transferDate, h.transferNo)} [ 1 / 1 ]</td><th className="w-[70px]">DATE</th><td>{h.transferDate.replaceAll('-', '. ')}</td></tr>
          <tr><th>출고처</th><td>{whText(h.fromWarehouseId, h.fromWarehouseName)}</td><th>입고처</th><td>{whText(h.toWarehouseId, h.toWarehouseName)}</td></tr>
        </tbody>
      </table>
      <table className="w-full text-left">
        <thead><tr><th className="w-[44px] text-center">순번</th><th className="w-[110px]">품목코드</th><th>품목명[규격명]</th><th className="w-[90px] text-right">수량</th><th>적요</th></tr></thead>
        <tbody>
          {slip.map((r, i) => {
            const spec = items.find((x) => x.id === r.itemId)?.spec
            return (
              <tr key={r.id}>
                <td className="text-center">{i + 1}</td><td>{r.itemCode}</td>
                <td>{r.itemName}{spec ? ` [${spec}]` : ''}</td>
                <td className="text-right">{fix2(Number(r.quantity))}</td><td>{r.reason ?? ''}</td>
              </tr>
            )
          })}
          <tr><th colSpan={3} className="text-right">수량</th><td className="text-right font-semibold">{fix2(total)}</td><td>인수 <span className="ml-[24px]">인</span></td></tr>
        </tbody>
      </table>
      <div className="flex gap-[4px] mt-[10px]">
        <button className="ec-btn ec-btn-primary" onClick={() => window.print()}>인쇄</button>
        <button className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </div>
  )
}
