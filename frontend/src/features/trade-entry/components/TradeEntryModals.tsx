import Modal from '../../../components/Modal'
import EcDateField from '../../../components/EcDateField'
import EcDateInput from '../../../components/ui/EcDateInput'
import CodePickerField from '../../../components/codepicker/CodePickerField'
import EcNumInput from '../../../components/EcNumInput'
import { SlipHistoryModal, SlipLastHistoryModal } from '../../sliphistory/SlipHistoryModal'
import EcRowCap, { capRows } from '../../../components/EcRowCap'
import type { SalesDoc, PurchaseDoc, Partner, Project, StockRow } from '../../../types/api'
import { fmtNumber } from '../../../utils/format'
import { ecAlert } from '../../../components/EcDialog'
import { OPTIONAL_COLS, SLIP_LOAD_MENUS, type Mode, type TradeEntryCfg } from '../tradeEntryConfig'
import type { Dispatch, SetStateAction } from 'react'

/** 일자변경 · 현금수금 · 열 선택 · 이력 · 거래내역보기 · 메뉴검색 창 — TradeEntry 에서 몸통 그대로 옮겼다. */
export default function TradeEntryModals({
  cashBanks,
  cashDepts,
  cashForm,
  cashMsg,
  cashOpen,
  cfg,
  changeDate,
  colPickerOpen,
  cols,
  copyFromDoc,
  date,
  dateChgOpen,
  dateChgTo,
  editing,
  error,
  historyOpen,
  menuSearchOpen,
  mode,
  openLoadSource,
  partnerDocs,
  partnerId,
  partners,
  projects,
  saveCash,
  setCashForm,
  setCashOpen,
  setColPickerOpen,
  setCols,
  setDateChgOpen,
  setDateChgTo,
  setHistoryOpen,
  setMenuSearchOpen,
  setSlipHistory,
  slipHistory,
  stocks,
}: {
  cashBanks: { id: number; code: string | null; name: string | null; bankName: string; accountNo: string | null; active: boolean; }[]
  cashDepts: { id: number; code: string | null; name: string; }[]
  cashForm: { date: string; departmentId: string; projectId: string; method: string; amount: string; fee: string; note: string; }
  cashMsg: string
  cashOpen: boolean
  cfg: TradeEntryCfg
  changeDate: () => Promise<void>
  colPickerOpen: boolean
  cols: Record<"stockAll" | "stockWh" | "unit" | "priceVat" | "lineTotal" | "mgmtItem" | "srcType" | "srcDate" | "srcNo" | "qcRequest", boolean>
  copyFromDoc: (d: SalesDoc | PurchaseDoc, close: () => void) => void
  date: string
  dateChgOpen: boolean
  dateChgTo: string
  editing: { id: number; docNo: string; } | null
  error: string
  historyOpen: boolean
  menuSearchOpen: boolean
  mode: Mode
  openLoadSource: () => Promise<void>
  partnerDocs: (SalesDoc | PurchaseDoc)[]
  partnerId: string
  partners: Partner[]
  projects: Project[]
  saveCash: () => Promise<void>
  setCashForm: Dispatch<SetStateAction<{ date: string; departmentId: string; projectId: string; method: string; amount: string; fee: string; note: string; }>>
  setCashOpen: Dispatch<SetStateAction<boolean>>
  setColPickerOpen: Dispatch<SetStateAction<boolean>>
  setCols: Dispatch<SetStateAction<Record<"stockAll" | "stockWh" | "unit" | "priceVat" | "lineTotal" | "mgmtItem" | "srcType" | "srcDate" | "srcNo" | "qcRequest", boolean>>>
  setDateChgOpen: Dispatch<SetStateAction<boolean>>
  setDateChgTo: Dispatch<SetStateAction<string>>
  setHistoryOpen: Dispatch<SetStateAction<boolean>>
  setMenuSearchOpen: Dispatch<SetStateAction<boolean>>
  setSlipHistory: Dispatch<SetStateAction<"H" | "last" | null>>
  slipHistory: "H" | "last" | null
  stocks: StockRow[]
}) {
  return (
    <>
      {/* ── 열 선택 ──────────────────────────────────────── */}
      {/* ── 현금수금(판매) — 원본 '매출처로부터' 입금 창 ───────────────── */}
      <Modal error={null} open={dateChgOpen} title="일자변경" width={360} onClose={() => setDateChgOpen(false)}>
        <div className="ec-form">
          <div className="flex items-center gap-[8px] mb-[6px]">
            <span className="w-[70px]">기존일자</span>
            <input className="ec-input" readOnly aria-label="기존일자" value={date} />
          </div>
          <div className="flex items-center gap-[8px] mb-[6px]">
            <span className="w-[70px]">변경일자</span>
            <EcDateField value={dateChgTo} onChange={setDateChgTo} />
          </div>
          <div className="flex gap-[4px] mt-[8px]">
            <button type="button" className="ec-btn ec-btn-primary" onClick={() => void changeDate()}>저장</button>
            <button type="button" className="ec-btn" onClick={() => setDateChgOpen(false)}>닫기</button>
          </div>
        </div>
      </Modal>
      <Modal error={cashMsg} open={cashOpen} title={mode === 'sales' ? '매출처로부터' : '매입처로'} width={520} onClose={() => setCashOpen(false)}>
        <div className="ec-form">
          <label className="block mb-[6px]">전표일자
            <EcDateInput className="ec-input ml-[8px]" value={cashForm.date} onChange={(e) => setCashForm((c) => ({ ...c, date: e.target.value }))} /></label>
          {/* 원본 창 차례: 전표일자 · 부서 · 프로젝트 · 입금계좌 · 거래처 · 금액 · 수수료 · 적요(2026-10-06 실측). */}
          <div className="flex items-center gap-[8px] mb-[6px]">부서
            <CodePickerField
              label="부서" hideLabel pair
              value={cashForm.departmentId} onChange={(v) => setCashForm((c) => ({ ...c, departmentId: v }))}
              items={cashDepts.map((d) => ({ value: String(d.id), code: d.code, name: d.name }))}
            />
          </div>
          <div className="flex items-center gap-[8px] mb-[6px]">프로젝트
            <CodePickerField
              label="프로젝트" hideLabel pair
              value={cashForm.projectId} onChange={(v) => setCashForm((c) => ({ ...c, projectId: v }))}
              items={projects.map((pj) => ({ value: String(pj.id), code: pj.code, name: pj.name }))}
            />
          </div>
          <label className="block mb-[6px]">{mode === 'sales' ? '입금계좌' : '출금계좌'}
            <select className="ec-input ml-[8px]" value={cashForm.method} onChange={(e) => setCashForm((c) => ({ ...c, method: e.target.value }))}>
              {mode === 'purchase' && <option value="">(출금계좌)</option>}
              <option value="현금">000 현금</option>
              {cashBanks.filter((b) => b.active).map((b) => (
                <option key={b.id} value={`bank:${b.id}`}>{[b.code, b.name || [b.bankName, (b.accountNo ?? '').replace(/\D/g, '').slice(-4)].filter(Boolean).join('-')].filter(Boolean).join(' ')}</option>
              ))}
            </select></label>
          <div className="mb-[6px]">거래처 <b className="ml-[8px]">{partners.find((p) => String(p.id) === partnerId)?.name ?? '(거래처를 먼저 고르세요)'}</b></div>
          <label className="block mb-[6px]">금액
            <EcNumInput className="ec-input ml-[8px] text-right" value={cashForm.amount} onValue={(v) => setCashForm((c) => ({ ...c, amount: v }))} /></label>
          {/* 원본 [수수료] — 수금 · 지급 둘 다(지급은 채무 금액 그대로 · 현금이 수수료만큼 더 나간다). 받은 돈 1,000 · 수수료 100 이면 채권은 1,100 줄고
              분개는 차)현금 1,000 · 지급수수료 100 / 대)외상매출금 1,100(2026-10-06 실측). */}
          {(
            <label className="block mb-[6px]">수수료
              <EcNumInput className="ec-input ml-[8px] text-right" value={cashForm.fee} onValue={(v) => setCashForm((c) => ({ ...c, fee: v }))} /></label>
          )}
          <label className="block mb-[6px]">적요
            <input className="ec-input ml-[8px] w-[300px]" value={cashForm.note} onChange={(e) => setCashForm((c) => ({ ...c, note: e.target.value }))} /></label>
        </div>
        <div className="flex gap-[6px] mt-[8px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => void saveCash()}>저장</button>
          <button type="button" className="ec-btn" onClick={() => setCashOpen(false)}>닫기</button>
        </div>
      </Modal>

      <Modal error={error} open={colPickerOpen} title="열 선택" width={360} onClose={() => setColPickerOpen(false)}>
        <p className="text-[12px] text-ec-label mt-0">
          원본에서 기본 숨김으로 깔려 있는 열입니다. 켜면 그리드에 나타납니다.
        </p>
        {OPTIONAL_COLS.filter((c) => c.id !== 'qcRequest' || mode === 'purchase').map((c) => (
          <label key={c.id} className="block py-[5px] px-0 text-[12.5px]">
            <input
              type="checkbox" checked={cols[c.id]} style={{ marginRight: 6 }}
              onChange={(e) => setCols((s) => ({ ...s, [c.id]: e.target.checked }))}
            />
            {c.title}
            {(c.id === 'stockAll' || c.id === 'stockWh') && stocks.length === 0 && (
              <span style={{ color: '#c07800', marginLeft: 6 }}>· [재고불러오기] 후 값이 채워집니다</span>
            )}
          </label>
        ))}
      </Modal>

      {slipHistory === 'H' && editing && (mode === 'sales' ? (
        <SlipHistoryModal target="SALES" id={editing.id} withSections
                          head={`[${date.replace(/-/g, '')}-${Number(editing.docNo.split('-').pop()) || editing.docNo}]`}
                          onClose={() => setSlipHistory(null)} />
      ) : (
        // 원본 구매 [H] 는 거래이력조회 [H] 꼴 — 머리 '[2026/10/21 -4]', 요일 없음, 마지막 열 '상태', 보안 · 발송이력 없음
        <SlipHistoryModal target="PURCHASE" id={editing.id}
                          head={`[${date.replace(/-/g, '/')} -${Number(editing.docNo.split('-').pop()) || editing.docNo}]`}
                          onClose={() => setSlipHistory(null)} />
      ))}
      {slipHistory === 'last' && editing && <SlipLastHistoryModal target="SALES" id={editing.id} onClose={() => setSlipHistory(null)} />}

      {/* ── 거래내역보기 ─────────────────────────────────── */}
      <Modal error={error} open={historyOpen} title={`거래내역보기 (${cfg.lineTab})`} width={720} onClose={() => setHistoryOpen(false)}>
        <p className="text-[12px] text-ec-label mt-0">
          이 거래처의 최근 전표입니다. 행을 누르면 그 전표의 품목·수량·단가를 지금 명세로 가져옵니다.
        </p>
        <div className="max-h-[340px] overflow-y-auto border border-ec-line border-solid">
          {/* 고르는 창이라 합계가 없다 — 몇 중 몇인지만 적는다. 안 적으면 찾는 전표가
              없다고 읽는다. */}
          <EcRowCap capped={partnerDocs.length > 30} shown={30} total={partnerDocs.length} sums={false}
                    hint="거래처를 바꾸거나 기간을 좁혀 보세요." />
          <table className="w-full text-left">
            <thead>
              <tr><th>전표번호</th><th>일자</th><th>품목</th><th className="text-right">합계</th></tr>
            </thead>
            <tbody>
              {partnerDocs.length === 0 ? (
                <tr><td colSpan={4} className="text-center text-ec-hint p-[16px]">등록된 데이터가 없습니다.</td></tr>
              ) : capRows(partnerDocs, 30).rows.map((d) => (
                <tr
                  key={d.id} className="cursor-pointer"
                  onClick={() => copyFromDoc(d, () => setHistoryOpen(false))}
                >
                  <td>{d.docNo}</td>
                  <td>{(d as SalesDoc).saleDate ?? (d as PurchaseDoc).purchaseDate}</td>
                  <td>{d.lines[0]?.itemName}{d.lines.length > 1 ? ` 외 ${d.lines.length - 1}건` : ''}</td>
                  <td className="text-right">{fmtNumber(d.totalAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>

      {/*
        ── 툴바 [전표불러오기] = 원본 '메뉴검색' 창(2026-10-31 loginad 판매입력 · 구매입력 실측) ──
        구분 / 메뉴 두 열, 아래 [닫기]. 메뉴를 누르면 그 전표의 검색창(예: 견적서검색창(조회))이 떠 거기서 골라 담는다.
        목록은 판매 · 구매가 같고 자기 자신(판매입력이면 [판매], 구매입력이면 [구매])만 빠진다.
        우리에게 담는 길이 있는 것은 [주문서](판매) · [발주서](구매) — 툴바 [주문] · [발주] 와 같은 창. 나머지는 동작 미구현 안내.
      */}
      <Modal open={menuSearchOpen} title="메뉴검색" width={696} onClose={() => setMenuSearchOpen(false)}>
        <div className="max-h-[520px] overflow-y-auto">
          <table className="w-full text-left">
            <colgroup><col width="50%" /><col width="50%" /></colgroup>
            <thead><tr><th className="text-center">구분</th><th className="text-center">메뉴</th></tr></thead>
            <tbody>
              {SLIP_LOAD_MENUS.filter(([, m]) => m !== cfg.lineTab).map(([g, m]) => (
                <tr key={`${g}-${m}`}>
                  <td>{g}</td>
                  <td>
                    <a className="text-ec-navy cursor-pointer" onClick={() => {
                      if ((mode === 'sales' && m === '주문서') || (mode === 'purchase' && m === '발주서')) {
                        setMenuSearchOpen(false); void openLoadSource(); return
                      }
                      void ecAlert(`${m} 전표 불러오기는 아직 연결되지 않았습니다.`)
                    }}>{m}</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex gap-[5px] mt-[9px]">
          <button type="button" className="ec-btn" onClick={() => setMenuSearchOpen(false)}>닫기</button>
        </div>
      </Modal>
    </>
  )
}
