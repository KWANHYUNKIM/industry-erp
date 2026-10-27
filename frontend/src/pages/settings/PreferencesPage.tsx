import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import Modal from '../../components/Modal'
import EcSettingSheet, { type SheetGroup, type SheetSection } from '../../components/EcSettingSheet'
import { useShortcut } from '../../utils/useShortcut'

/**
 * Self-Customizing > 환경설정 > 기능설정 (원본 C000113).
 *
 * <p>원본은 [공통 · 회계 · 재고 · 관리 · 그룹웨어 · 데이터센터] 알약 아래 '○○ 공통설정' 판을 펴 두고,
 * 판 안에 ▼작은 묶음(국가 및 통화 · 부가세 …)마다 [이름(링크) · 값] 줄을 늘어놓는다.
 * 이름을 누르면 <b>그 묶음</b> 팝업이 떠서(제목 = 묶음 이름) 항목마다 ⊙이름 · 설명 · 입력칸을 보여 주고
 * [저장(F8)] [닫기] 로 끝난다. 저장은 마스터·설정관리자만 된다(우리는 SETTINGS 권한 — 없으면 403).
 *
 * <p><b>우리 ERP 가 실제로 가진 설정만 싣는다.</b> 원본 항목은 수십 개지만(영업주기 · 편집제한일자 · 전표자동생성 …)
 * 우리에게 그 동작이 없는 것을 줄로 그리면 바꿔도 아무 일이 없는 칸이 된다(옛 화면의 '(미적용)' 토글 다섯이 그랬다).
 * 고정값인 것(국가 · 부가세율 · 채권/채무 계정 · 부서/프로젝트별관리 · 단가 vat 별도 · 회계반영 수동 · 로트No. 선택입력)은
 * 값만 보이고 누를 수 없다 — 코드에서 그 동작을 확인한 것만(2026-10-13 원본 C000113 여섯 탭 실측과 대조).
 */

const TABS = ['공통', '회계', '재고', '관리', '그룹웨어', '데이터센터'] as const
type TabKey = typeof TABS[number]

interface Preference { fiscalStart: string; [k: string]: unknown }

const FISCAL_DESC = '회계연도가 시작하는 달을 선택합니다. 장부·재무제표의 기초 기간이 이 달부터 잡힙니다.'
const NEGATIVE_DESC = '재고가 부족해도 판매 · 생산불출 · 생산입고 소모 · 재고조정을 저장합니다. 재고현황에는 −로 남습니다.'

function sheetOf(p: Preference): Record<TabKey, SheetSection[]> {
  return {
    공통: [{
      title: '공통설정',
      groups: [
        { title: '국가 및 통화', rows: [
          { label: '국가', value: '대한민국' },
          { label: '표준시간', value: '(UTC +09:00) 서울' },
          { label: '기본통화', value: '원' },
        ] },
        { title: '부가세', rows: [
          { label: '재고-부가세', value: '매출 : 10 % / 매입 : 10 %' },
        ] },
      ],
    }],
    회계: [{
      title: '회계 공통설정',
      groups: [
        // 원본 기능설정에는 없는 줄 — 회계 장부·재무제표가 기초 기간을 이 달부터 잡는다(원본은 회사정보의 회계기수).
        { title: '기본', rows: [{ label: '회계연도 시작월', value: `${Number(p.fiscalStart)}월`, editable: true }] },
        // 회계전표 줄(JournalLine)이 부서 · 프로젝트를 늘 받는다 — 끌 수 없다.
        { title: '관리여부', rows: [
          { label: '(회계)부서별관리', value: '사용' },
          { label: '(회계)프로젝트별관리', value: '사용' },
        ] },
      ],
    }],
    재고: [{
      title: '재고 공통설정',
      groups: [
        // 판매 · 구매 전표가 프로젝트를 받는다(trade Sales/Purchase.project).
        { title: '기본', rows: [{ label: '(재고)프로젝트별관리', value: '사용' }] },
        // 재고가 0 아래로 내려가도 판매 · 생산이 저장되는가(StockService · NegativeStockPolicy). 원본 줄 이름은 아직 못 잼.
        { title: '재고수량', rows: [{ label: '재고 마이너스 허용', value: p.negativeStock ? '사용' : '사용안함', editable: true }] },
        { title: '채권채무관리', rows: [
          { label: '채권계정', value: '외상매출금' },
          { label: '채무계정', value: '외상매입금' },
        ] },
        // 공급가액 = 수량 × 단가(VatAllocator.lineSupply) — 단가는 늘 부가세 별도다.
        { title: '단가(vat포함)', rows: [
          { label: '영업관리', value: '사용안함' },
          { label: '구매관리', value: '사용안함' },
        ] },
        // 저장만으로 회계전표가 생기지 않는다 — [회계반영] 을 따로 누른다.
        { title: '전표자동생성(회계반영)', rows: [
          { label: '판매', value: '사용안함' },
          { label: '구매', value: '사용안함' },
        ] },
        // 판매 · 구매 줄의 로트No. 는 비워도 저장된다(SalesLine.lotNo nullable).
        { title: '입력항목설정(시리얼/로트No.)', rows: [{ label: '필수입력여부', value: '선택입력' }] },
      ],
    }],
    관리: [],
    그룹웨어: [],
    데이터센터: [],
  }
}

export default function PreferencesPage() {
  const [pref, setPref] = useState<Preference | null>(null)
  const [editing, setEditing] = useState<SheetGroup | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<Preference | null>('/preferences')
      .then((r) => setPref({ fiscalStart: '01', ...(r.data ?? {}) }))
      .catch((err) => setError(extractErrorMessage(err)))
  }, [])

  const blank: Preference = { fiscalStart: '01' }
  return (
    <EcSettingSheet title="기능설정" tabs={TABS} sheet={sheetOf(pref ?? blank)} loading={!pref}
      onEdit={(g) => { setError(''); setEditing(g) }}>
      {error && !editing && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {editing && pref && (
        <EditDialog title={editing.title} pref={pref} error={error} onError={setError}
          onClose={() => { setEditing(null); setError('') }}
          onSaved={(p) => { setPref(p); setEditing(null) }} />
      )}
    </EcSettingSheet>
  )
}

/** 묶음 하나의 팝업. 원본처럼 ⊙이름 · 설명 · 입력칸을 항목마다 쌓고 [저장(F8)] [닫기] 로 끝난다. */
function EditDialog({ title, pref, error, onError, onClose, onSaved }: {
  title: string; pref: Preference; error: string
  onError: (m: string) => void; onClose: () => void; onSaved: (p: Preference) => void
}) {
  const [form, setForm] = useState<Preference>(pref)
  const [saving, setSaving] = useState(false)

  async function save() {
    if (saving) return
    setSaving(true); onError('')
    try {
      const r = await api.put<Preference>('/preferences', form)
      onSaved(r.data)
    } catch (err) {
      onError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }
  useShortcut('F8', save, !saving)

  return (
    <Modal open title={title} onClose={onClose} error={error} width={960}>
      {title === '재고수량' ? (
      <div className="pb-[10px] mb-[10px]">
        <div className="mb-[2px]">⊙ 재고 마이너스 허용</div>
        <div className="pl-[13px] mb-[6px]">{NEGATIVE_DESC}</div>
        <div className="pl-[13px]">
          {([[true, '사용'], [false, '사용안함']] as const).map(([v, l]) => (
            <label key={l} className="mr-[10px]">
              <input type="radio" name="pref-negative-stock" checked={!!form.negativeStock === v}
                onChange={() => setForm((f) => ({ ...f, negativeStock: v }))} /> {l}
            </label>
          ))}
        </div>
      </div>
      ) : (
      <div className="pb-[10px] mb-[10px]">
        <div className="mb-[2px]">⊙ 회계연도 시작월</div>
        <div className="pl-[13px] mb-[6px]">{FISCAL_DESC}</div>
        <div className="pl-[13px]">
          <select className="ec-input w-[120px]" value={form.fiscalStart}
            onChange={(e) => setForm((f) => ({ ...f, fiscalStart: e.target.value }))}>
            {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'))
              .map((m) => <option key={m} value={m}>{Number(m)}월</option>)}
          </select>
        </div>
      </div>
      )}
      <div className="ec-slip-footer">
        <button className="ec-btn ec-btn-primary" onClick={save} disabled={saving}>저장(F8)</button>
        <button className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}
