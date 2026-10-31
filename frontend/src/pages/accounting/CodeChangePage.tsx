import { useEffect, useState } from 'react'
import Modal from '../../components/Modal'
import EcListShell from '../../components/EcListShell'
import CodePickerField, { type CodeItem } from '../../components/codepicker/CodePickerField'
import { EcCond } from '../../components/EcStatusPanel'
import { api, extractErrorMessage } from '../../api/client'
import { ecAlert } from '../../components/EcDialog'
import { useDeptProjectItems } from '../../features/cashquick/useDeptProject'
import { ymd } from '../../utils/periods'
import { EcDateRange } from '../../components/ui/EcDateInput'

/**
 * 회계 I › 기초등록 › <b>각종코드변경</b>(원본 E010111) — 2026-10-13 loginaa 실측(plans/회계1/E010111.md).
 *
 * 머리 [Option] · [도움말](Search 없음). 알약 계정 · 거래처 · 부서 · 프로젝트. 판: 기준일자(오늘부터 2년 전 ~ 오늘) · 프로젝트 · 거래처 · 부서 ·
 * 변경 전 코드 · 변경 후 코드. 하단 [변경] · [다시 작성]. 기간 · 프로젝트 · 거래처 · 부서로 좁힌 이미 입력된 전표 줄의 그 코드를 한꺼번에 바꾼다.
 */
type Kind = 'ACCOUNT' | 'PARTNER' | 'DEPARTMENT' | 'PROJECT'
const KINDS: [Kind, string][] = [['ACCOUNT', '계정'], ['PARTNER', '거래처'], ['DEPARTMENT', '부서'], ['PROJECT', '프로젝트']]

function initial() {
  const today = new Date()
  const from = new Date(today); from.setFullYear(today.getFullYear() - 2)
  return { from: ymd(from), to: ymd(today), project: '', partner: '', dept: '', before: '', after: '' }
}

export default function CodeChangePage() {
  const [kind, setKind] = useState<Kind>('ACCOUNT')
  const [f, setF] = useState(initial)
  const [accounts, setAccounts] = useState<CodeItem[]>([])
  const [partners, setPartners] = useState<CodeItem[]>([])
  const dp = useDeptProjectItems()

  useEffect(() => {
    api.get<{ id: number; code: string; name: string; active: boolean }[]>('/accounts')
      .then((r) => setAccounts(r.data.map((a) => ({ value: String(a.id), code: a.code, name: a.name, stopped: !a.active })))).catch(() => undefined)
    api.get<{ id: number; code: string; name: string }[]>('/partners')
      .then((r) => setPartners(r.data.map((p) => ({ value: String(p.id), code: p.code, name: p.name })))).catch(() => undefined)
  }, [])

  const itemsOf = (k: Kind): CodeItem[] => (k === 'ACCOUNT' ? accounts : k === 'PARTNER' ? partners : k === 'DEPARTMENT' ? dp.departments : dp.projects)
  const label = KINDS.find(([k]) => k === kind)?.[1] ?? ''
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }))
  /** 빈 [변경] → 글 없이 변경 전 · 후 칸 빨간 테두리(원본 2026-10-21). */
  const [invalid, setInvalid] = useState(false)
  /** 확인 창의 보안 문구 — 원본은 무작위 여섯 글자를 그대로 쳐야 [확인]이 먹는다. */
  const [phrase, setPhrase] = useState<string | null>(null)
  const [typed, setTyped] = useState('')
  const newPhrase = () => Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'[Math.floor(Math.random() * 55)]).join('')

  async function change() {
    if (!f.before || !f.after) { setInvalid(true); return }
    setInvalid(false)
    if (f.before === f.after) { await ecAlert('변경 전과 후의 코드가 동일합니다.'); return }
    setTyped(''); setPhrase(newPhrase())
  }

  async function confirmChange() {
    if (typed !== phrase) return
    setPhrase(null)
    try {
      const r = await api.post<{ changed: number }>('/journals/code-change', {
        kind, from: f.from, to: f.to,
        projectId: f.project ? Number(f.project) : null, partnerId: f.partner ? Number(f.partner) : null, departmentId: f.dept ? Number(f.dept) : null,
        beforeId: f.before ? Number(f.before) : null, afterId: f.after ? Number(f.after) : null,
      })
      await ecAlert(`${r.data.changed}건이 변경되었습니다.`)
    } catch (e) {
      await ecAlert(extractErrorMessage(e))
    }
  }

  return (
    <EcListShell
      title="각종코드변경"
      searchable={false}
      onReset={() => setF(initial())}
      actions={[{ label: '변경', primary: true, onClick: () => void change() }, { label: '다시 작성', onClick: () => setF(initial()) }]}
    >
      <div className="ec-pills mb-[8px]">
        {KINDS.map(([k, l]) => (
          <button key={k} type="button" className={`ec-pill${kind === k ? ' active' : ''}`}
                  onClick={() => { setKind(k); setF((x) => ({ ...x, before: '', after: '' })) }}>{l}</button>
        ))}
      </div>
      <ul className="ec-form">
        <EcCond label="기준일자" span={2}>
          <EcDateRange from={{ className: "ec-input w-[145px]", 'aria-label': "시작일자", value: f.from, onChange: (e) => set({ from: e.target.value }) }} to={{ className: "ec-input w-[145px]", 'aria-label': "종료일자", value: f.to, onChange: (e) => set({ to: e.target.value }) }} />
        </EcCond>
        {kind !== 'PROJECT' && kind !== 'PARTNER' && (
          <EcCond label="프로젝트" pick span={2}>
            <CodePickerField label="프로젝트" hideLabel width={220} emptyLabel="전체" value={f.project} onChange={(v) => set({ project: v })} items={dp.projects} />
          </EcCond>
        )}
        {kind !== 'PARTNER' && (
          <EcCond label="거래처" pick span={2}>
            <CodePickerField label="거래처" hideLabel width={220} emptyLabel="전체" value={f.partner} onChange={(v) => set({ partner: v })} items={partners} />
          </EcCond>
        )}
        {kind !== 'DEPARTMENT' && kind !== 'PARTNER' && (
          <EcCond label="부서" pick span={2}>
            <CodePickerField label="부서" hideLabel width={220} emptyLabel="전체" value={f.dept} onChange={(v) => set({ dept: v })} items={dp.departments} />
          </EcCond>
        )}
        <EcCond label="변경 전 코드" pick span={2}>
          <div className={invalid && !f.before ? 'ec-invalid' : undefined}><CodePickerField label={`변경 전 ${label}`} hideLabel width={260} emptyLabel="선택" value={f.before} onChange={(v) => set({ before: v })} items={itemsOf(kind)} /></div>
        </EcCond>
        <EcCond label="변경 후 코드" pick span={2}>
          <div className={invalid && !f.after ? 'ec-invalid' : undefined}><CodePickerField label={`변경 후 ${label}`} hideLabel width={260} emptyLabel="선택" value={f.after} onChange={(v) => set({ after: v })} items={itemsOf(kind)} /></div>
        </EcCond>
      </ul>

      {/* 원본 확인 창(2026-10-21 실측, 784) — 되돌릴 수 없는 일이라 보안 문구를 쳐야 [확인]. */}
      <Modal open={phrase != null} title="각종코드변경" width={784} error={null} onClose={() => setPhrase(null)}>
        <p className="mb-[10px] leading-[1.6]">
          코드변경 적용범위는 전체메뉴 입니다.<br />
          선택한 조건(프로젝트/거래처/창고)이 없는 메뉴는<br />
          조건을 제외하고 코드변경이 적용 됩니다.<br />
          단, 재고조정/잔액조정 메뉴는 적용되지 않습니다.<br />
          변경된 자료는 복원이 불가능합니다.<br />
          코드변경 이후에는 재고 수량 및 잔액이 달라짐으로 확인이 필요합니다.
        </p>
        <div className="flex items-center gap-[6px] mb-[10px]">
          <b className="tracking-[2px]">{phrase}</b>
          <input className="ec-input w-[140px]" aria-label="보안 문구" value={typed} onChange={(e) => setTyped(e.target.value)} />
          <button type="button" className="ec-btn ec-btn-sm" onClick={() => { setPhrase(newPhrase()); setTyped('') }}>문구새로고침</button>
        </div>
        <div className="flex gap-[5px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => void confirmChange()}>확인</button>
          <button type="button" className="ec-btn" onClick={() => setPhrase(null)}>닫기</button>
        </div>
      </Modal>
    </EcListShell>
  )
}
