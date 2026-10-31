import EcDateField from '../../../components/EcDateField'
import CodePickerField from '../../../components/codepicker/CodePickerField'
import { partnerCodeItems } from '../../../utils/codeItems'
import { fmtNumber, parseNumPlain } from '../../../utils/format'
import { type Mode, type TradeEntryCfg } from '../tradeEntryConfig'
import type { Partner, CustomFieldDef, EmployeeMaster, Project, Warehouse } from '../../../types/api'
import type { Dispatch, SetStateAction } from 'react'

/** 판매 · 구매입력 머리 칸(원본 ul.wrapper-form)과 외화 환산 줄 — TradeEntry 에서 몸통 그대로 옮겼다. */
export default function TradeEntryHead({
  adjust,
  anyPartner,
  anyPartnerName,
  cfg,
  choosePartner,
  currencies,
  currencyCode,
  customDefs,
  customValues,
  date,
  editing,
  employeeId,
  employees,
  exchangeRate,
  fnOpen,
  foreign,
  fx,
  isAdjust,
  mode,
  partnerId,
  projectId,
  projects,
  rate,
  remark,
  setAnyName,
  setCurrencyCode,
  setCustomValues,
  setDate,
  setDateChgOpen,
  setDateChgTo,
  setEmployeeId,
  setExchangeRate,
  setFnOpen,
  setForeign,
  setProjectId,
  setRemark,
  setTaxable,
  setWarehouseId,
  showExtra,
  taxable,
  totals,
  usablePartners,
  warehouseId,
  warehouses,
}: {
  adjust: boolean
  anyPartner: boolean
  anyPartnerName: string
  cfg: TradeEntryCfg
  choosePartner: (v: string) => void
  currencies: { id: number; code: string; name: string; active: boolean; latestRate: number | null; }[]
  currencyCode: string
  customDefs: CustomFieldDef[]
  customValues: Record<string, string>
  date: string
  editing: { id: number; docNo: string; } | null
  employeeId: string
  employees: EmployeeMaster[]
  exchangeRate: string
  fnOpen: boolean
  foreign: boolean
  fx: boolean
  isAdjust: boolean
  mode: Mode
  partnerId: string
  projectId: string
  projects: Project[]
  rate: number
  remark: string
  setAnyName: Dispatch<SetStateAction<{ id: string; name: string; } | null>>
  setCurrencyCode: Dispatch<SetStateAction<string>>
  setCustomValues: Dispatch<SetStateAction<Record<string, string>>>
  setDate: Dispatch<SetStateAction<string>>
  setDateChgOpen: Dispatch<SetStateAction<boolean>>
  setDateChgTo: Dispatch<SetStateAction<string>>
  setEmployeeId: Dispatch<SetStateAction<string>>
  setExchangeRate: Dispatch<SetStateAction<string>>
  setFnOpen: Dispatch<SetStateAction<boolean>>
  setForeign: Dispatch<SetStateAction<boolean>>
  setProjectId: Dispatch<SetStateAction<string>>
  setRemark: Dispatch<SetStateAction<string>>
  setTaxable: Dispatch<SetStateAction<boolean>>
  setWarehouseId: Dispatch<SetStateAction<string>>
  showExtra: boolean
  taxable: boolean
  totals: { qty: number; supply: number; vat: number; extra: number; foreign: number; total: number; }
  usablePartners: Partner[]
  warehouseId: string
  warehouses: Warehouse[]
}) {
  return (
    <>
        {/* ── 헤더 항목 폼 (원본 ul.wrapper-form) ───────────── */}
        {/* 이름표 폭은 원본이 화면마다 정한다 — 판매입력 E040205 는 120(실측 2026-10-21) */}
        <ul className={`ec-form${mode === 'sales' && !adjust ? ' [&>li>.title]:basis-[120px]' : ''}`}>
          <li>
            <div className="title">{mode === 'sales' && !isAdjust ? '일자-No.' : '일자'}</div>
            <div className="form"><EcDateField value={date} onChange={setDate} disabled={!!editing} /></div>
          </li>
          <li>
            {/* 원본 구매입력 거래처 · 입고창고에는 * 표가 없다(2026-10-31 loginad 구매 QA). 비우면 저장할 때 막는 것은 그대로. */}
            <div className="title">{cfg.partnerLabel}{mode === 'sales' && <span className="req">*</span>}</div>
            <div className="form">
              <CodePickerField
                label={cfg.partnerLabel} hideLabel pair
                value={partnerId} onChange={choosePartner}
                items={partnerCodeItems(usablePartners, true)}
                {...(anyPartner ? { nameValue: anyPartnerName, onNameChange: (n: string) => setAnyName({ id: partnerId, name: n }) } : {})}
              />
            </div>
          </li>
          <li>
            <div className="title">담당자</div>
            <div className="form">
              <CodePickerField
                label="담당자" hideLabel pair
                value={employeeId} onChange={setEmployeeId}
                items={employees.map((em) => ({ value: String(em.id), code: em.code, name: em.name, sub: em.department }))}
              />
            </div>
          </li>
          <li>
            <div className="title">{cfg.whLabel}{mode === 'sales' && <span className="req">*</span>}</div>
            <div className="form">
              <CodePickerField
                label={cfg.whLabel} hideLabel pair
                value={warehouseId} onChange={setWarehouseId}
                items={warehouses.map((w) => ({ value: String(w.id), code: w.code, name: w.name, sub: w.location, stopped: !w.active }))}
              />
            </div>
          </li>
          <li>
            <div className="title">거래유형</div>
            <div className="form">
              <select className="ec-input" value={taxable ? '11' : '12'} onChange={(e) => setTaxable(e.target.value === '11')} style={{ width: 170 }}>
                <option value="11">부가세율 적용</option>
                <option value="12">부가세율 미적용</option>
              </select>
            </div>
          </li>
          <li>
            <div className="title">통화</div>
            <div className="form">
              <select className="ec-input" value={foreign ? 'F' : 'D'} onChange={(e) => setForeign(e.target.value === 'F')} style={{ width: 80 }}>
                <option value="D">내자</option>
                <option value="F">외자</option>
              </select>
              {/* 원본 판매입력: 임의거래처를 고르면 통화 자리에 [거래처명] 칸이 하나 더 생기고 이름 칸과 같은 값을 든다(2026-10-28 실측) */}
              {anyPartner && (
                <input
                  className="ec-input w-[150px]" aria-label="거래처명" placeholder="거래처명"
                  value={anyPartnerName} onChange={(e) => setAnyName({ id: partnerId, name: e.target.value })}
                />
              )}
              {mode === 'purchase' && foreign && (
                <select
                  className="ec-input w-[120px]" aria-label="외화" value={currencyCode}
                  onChange={(e) => {
                    setCurrencyCode(e.target.value)
                    const c = currencies.find((x) => x.code === e.target.value)
                    if (c?.latestRate && parseNumPlain(exchangeRate) <= 0) setExchangeRate(String(c.latestRate))
                  }}
                >
                  <option value="">외화 선택</option>
                  {currencies.filter((c) => c.active || c.code === currencyCode).map((c) => (
                    <option key={c.code} value={c.code}>{c.code} {c.name}</option>
                  ))}
                </select>
              )}
              {foreign && (
                <input
                  className="ec-input" value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)}
                  placeholder="환율" style={{ width: 90, textAlign: 'right' }}
                />
              )}
            </div>
          </li>
          {/*
            원본 판매입력 머리에는 [프로젝트] 가 없다(일자-No. · 거래처 · 담당자 · 출하창고 · 거래유형 · 통화 · 첨부), 구매입력에는 있다
            (2026-10-14 loginaa 실측). 판매는 주문 · 수정에서 이어받은 값이 있을 때만 보인다 — 프로젝트별 손익이 그 값을 쓴다.
          */}
          {/* 2026-10-31 loginad 원본 판매입력 머리에는 [프로젝트] 가 있다(거래유형 아래). 저장 값(projectId)은 원래 요청에 있다. */}
          {(mode !== 'sales' || !isAdjust || projectId) && (
          <li>
            <div className="title">프로젝트</div>
            <div className="form">
              <CodePickerField
                label="프로젝트" hideLabel pair
                value={projectId} onChange={setProjectId}
                items={projects.map((pj) => ({ value: String(pj.id), code: pj.code, name: pj.name }))}
              />
            </div>
          </li>
          )}
          {!isAdjust && (<>
          {/* 원본 신규 창에는 판매No. 칸이 없다(번호는 저장할 때 일자-No. 로 붙는다). 수정 창은 번호 · [Fn] 일자변경을 보인다. */}
          {editing && <li>
            <div className="title">{cfg.docNoLabel}</div>
            <div className="form">
              <input className="ec-input" readOnly aria-label="일자-No." value={editing ? `${date.replace(/-/g, '/')} -${editing.docNo.split('-').pop()?.replace(/^0+/, '') ?? ''}` : '(저장 시 자동채번)'} style={{ width: 170, background: '#f4f5f7', color: 'var(--ec-text-hint)' }} />
              {editing && (
                <span className="relative inline-block ml-[4px]">
                  <button type="button" className="ec-btn ec-btn-sm" onClick={() => setFnOpen((o) => !o)}>Fn</button>
                  {fnOpen && (
                    <span className="absolute left-0 top-full z-20 bg-white border border-ec-line rounded-ec min-w-[90px]">
                      <button type="button" className="ec-btn ec-btn-sm w-full"
                              onClick={() => { setFnOpen(false); setDateChgTo(date); setDateChgOpen(true) }}>일자변경</button>
                    </span>
                  )}
                </span>
              )}
            </div>
          </li>}
          <li className="wide">
            <div className="title">적요</div>
            <div className="form">
              <input className="ec-input" value={remark} onChange={(e) => setRemark(e.target.value)}
                     placeholder="전표 적요" style={{ flex: 1 }} />
            </div>
          </li>
          </>)}

          {/* 확장(추가) 항목 — 원본의 ADD_TXT/ADD_NUM/ADD_DATE/ADD_CD 자리.
              우리 쪽은 Self-Customizing > 사용자정의필드에 정의한 항목이 여기에 나온다. */}
          {showExtra && (customDefs.length === 0 ? (
            <li className="wide">
              <div className="title">추가항목</div>
              <div className="form text-ec-hint">
                정의된 추가항목이 없습니다. [Self-Customizing &gt; 사용자정의필드]에서 <b>{cfg.entityType}</b> 항목을 만들면 여기에 나옵니다.
              </div>
            </li>
          ) : customDefs.map((d) => (
            <li key={d.fieldKey}>
              <div className="title">{d.label}{d.required && <span className="req">*</span>}</div>
              <div className="form">
                {d.fieldType === 'CODE' ? (
                  <select
                    className="ec-input" style={{ flex: 1 }}
                    value={customValues[d.fieldKey] ?? ''}
                    onChange={(e) => setCustomValues((v) => ({ ...v, [d.fieldKey]: e.target.value }))}
                  >
                    <option value="">선택</option>
                    {(d.options ?? '').split(',').map((o) => o.trim()).filter(Boolean).map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input
                    className="ec-input"
                    type={d.fieldType === 'DATE' ? 'date' : d.fieldType === 'NUMBER' ? 'number' : 'text'}
                    style={{ flex: 1, textAlign: d.fieldType === 'NUMBER' ? 'right' : undefined }}
                    value={customValues[d.fieldKey] ?? ''}
                    onChange={(e) => setCustomValues((v) => ({ ...v, [d.fieldKey]: e.target.value }))}
                  />
                )}
              </div>
            </li>
          )))}
        </ul>

        {/*
          이 화면이 따르는 원본은 **판매입력(ESD006M)** 이고, 거기에는
          "금액조정항목명/공급가액/부가세/합계" 표가 없다. 합계는 그리드 하단 합계행이 지고,
          우리 표는 그것과 중복이었다. 원본 구조(헤더폼 → 툴바 → 그리드 → 합계행 → 푸터)에
          맞춰 걷어낸다. 다만 외화 전표일 때의 환산액은 합계행이 못 보여 주므로 한 줄로 남긴다.

          이 자리의 근거를 두 번 고쳤다. 처음에는 "아카이브 전체에 '금액조정'·'외화금액'·
          '원화금액' 0건" 이라고 적혀 있었는데 세어 보니 금액조정항목명 3건·외화금액 2건이었다.
          그다음엔 "그 3건은 다른 화면 것" 이라고 고쳤는데 **그것도 틀렸다** — 사본에서 뽑은
          화면코드 지도(qa/fixtures/ecount-screen-codes.json)로 보니 ESD066M 이 바로
          **판매입력 II** 다. 즉 원본에는 판매입력(ESD006M)과 판매입력 II(ESD066M)가 따로 있고,
          금액조정 표는 뒤엣것에 있다.

          2026-10-13 판매입력 II 를 따로 열었다(/sales/sell2, adjust) — 그쪽에서만 격자 아래 금액조정 표와
          [금액조정] 창을 그린다. 판매입력(/sales/sell)에는 원본처럼 없다.
        */}
        {foreign && !fx && rate > 0 && (
          <div className="mt-[6px] text-right text-[12px] text-ec-label">
            외화금액{' '}
            <b className="text-ec-text">
              {(totals.total / rate).toLocaleString('ko-KR', { maximumFractionDigits: 2 })}
            </b>
            {'  ·  원화금액 '}
            <b style={{ color: cfg.accent }}>{fmtNumber(totals.total)}</b>
          </div>
        )}
    </>
  )
}
