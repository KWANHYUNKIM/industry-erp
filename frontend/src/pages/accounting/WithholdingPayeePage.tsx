import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import CodePickerField from '../../components/CodePickerField'
import { EcCond } from '../../components/EcStatusPanel'
import { api, extractErrorMessage } from '../../api/client'
import type { PayeeKind, WithholdingCodeItem, WithholdingPayee } from '../../types/api'

type Form = {
  id?: number
  kind: PayeeKind
  bizRegNo: string
  regNo: string
  tradeName: string
  name: string
  address: string
  englishName: string
  bizAddress: string
  payeeKindCode: string
  industryCode: string
  bankName: string
  accountNo: string
  nonResident: boolean
  foreigner: boolean
  nonRealName: boolean
  birthDate: string
  accountCode: string
  mobile: string
  email: string
  memo: string
}

const EMPTY: Form = {
  kind: 'INDIVIDUAL', bizRegNo: '', regNo: '', tradeName: '', name: '', address: '', englishName: '', bizAddress: '',
  payeeKindCode: '', industryCode: '', bankName: '', accountNo: '', nonResident: false, foreigner: false, nonRealName: false,
  birthDate: '', accountCode: '', mobile: '', email: '', memo: '',
}

function toForm(p: WithholdingPayee): Form {
  return {
    id: p.id, kind: p.kind, bizRegNo: p.bizRegNo ?? '', regNo: p.regNo, tradeName: p.tradeName ?? '', name: p.name,
    address: p.address ?? '', englishName: p.englishName ?? '', bizAddress: p.bizAddress ?? '',
    payeeKindCode: p.payeeKindCode ?? '', industryCode: p.industryCode ?? '', bankName: p.bankName ?? '',
    accountNo: p.accountNo ?? '', nonResident: p.nonResident, foreigner: p.foreigner, nonRealName: p.nonRealName,
    birthDate: p.birthDate ?? '', accountCode: p.accountCode ?? '', mobile: p.mobile ?? '', email: p.email ?? '', memo: p.memo ?? '',
  }
}

/**
 * 소득자등록 (원본 세무 › 기타원천세 › 소득자등록 E030301, 2026-10-04 loginaa 실측).
 *
 * <p>목록 [☐ · 구분 · 성명(대표자명) · 주민(법인)등록번호 앞자리 · 상호 · 사업자등록번호], 아래 [신규(F2) · 삭제/삭제취소].
 * 성명을 누르면 같은 창으로 고친다. 입력 창 칸 차례도 원본 그대로 — 구분(법인 · 개인, 기본 개인) · 사업자등록번호 ·
 * 주민(법인)등록번호(필수) · 상호 · 성명(대표자명)(필수) · 주소 · 영문명 · 사업장소재지 · 소득자구분코드 · 업종구분코드 ·
 * 은행명 · 계좌(증서)번호 · 기타구분(비거주자 · 외국인 · 비실명(이자/배당소득용) · 생년월일) · 계정코드 · 모바일 · Email · 적요.
 * 비운 필수칸은 '주민(법인)등록번호를 입력하세요.' 부터 막는다. [Excel] · [웹자료올리기] 는 두지 않았다.
 */
export default function WithholdingPayeePage() {
  const [rows, setRows] = useState<WithholdingPayee[]>([])
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [error, setError] = useState('')
  const [form, setForm] = useState<Form | null>(null)
  const [formError, setFormError] = useState('')
  const [industries, setIndustries] = useState<WithholdingCodeItem[]>([])
  const [payeeKinds, setPayeeKinds] = useState<WithholdingCodeItem[]>([])

  function load() {
    setError('')
    api.get<WithholdingPayee[]>('/withholding-payees')
      .then((r) => { setRows(r.data); setPicked(new Set()) })
      .catch((e) => { setRows([]); setError(extractErrorMessage(e)) })
  }
  useEffect(() => {
    load()
    api.get<WithholdingCodeItem[]>('/withholding-payees/codes/industry').then((r) => setIndustries(r.data)).catch(() => setIndustries([]))
    api.get<WithholdingCodeItem[]>('/withholding-payees/codes/payee-kind').then((r) => setPayeeKinds(r.data)).catch(() => setPayeeKinds([]))
  }, [])

  async function save() {
    if (!form) return
    if (!form.regNo.trim()) { setFormError('주민(법인)등록번호를 입력하세요.'); return }
    if (!form.name.trim()) { setFormError('성명(대표자명)을 입력하세요.'); return }
    const body = {
      kind: form.kind, bizRegNo: form.bizRegNo, regNo: form.regNo, tradeName: form.tradeName, name: form.name,
      address: form.address, englishName: form.englishName, bizAddress: form.bizAddress,
      payeeKindCode: form.payeeKindCode, industryCode: form.industryCode, bankName: form.bankName, accountNo: form.accountNo,
      nonResident: form.nonResident, foreigner: form.foreigner, nonRealName: form.nonRealName, birthDate: form.birthDate,
      accountCode: form.accountCode, mobile: form.mobile, email: form.email, memo: form.memo,
    }
    try {
      if (form.id) await api.put(`/withholding-payees/${form.id}`, body)
      else await api.post('/withholding-payees', body)
      setForm(null)
      load()
    } catch (e) {
      setFormError(extractErrorMessage(e))
    }
  }

  async function toggleDeleted() {
    try {
      await api.post('/withholding-payees/toggle-deleted', [...picked])
      load()
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  const q = search.trim()
  const list = q ? rows.filter((r) => [r.name, r.tradeName, r.bizRegNo].some((v) => (v ?? '').includes(q))) : rows
  const allPicked = list.length > 0 && list.every((r) => picked.has(r.id))
  const set = (patch: Partial<Form>) => form && setForm({ ...form, ...patch })

  return (
    <EcListShell title="소득자등록" search={search} onSearchChange={setSearch} onSearch={load}
                 onNew={() => { setFormError(''); setForm({ ...EMPTY }) }}
                 actions={[{ label: '삭제/삭제취소', onClick: toggleDeleted, disabled: picked.size === 0 }]}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <table className="w-full">
        <thead>
          <tr>
            <th className="w-[47px]">
              <input type="checkbox" aria-label="전체 선택" checked={allPicked}
                     onChange={() => setPicked(allPicked ? new Set() : new Set(list.map((r) => r.id)))} />
            </th>
            <th className="text-center">구분</th>
            <th>성명(대표자명)</th>
            <th>주민(법인)등록번호 앞자리</th>
            <th>상호</th>
            <th>사업자등록번호</th>
          </tr>
        </thead>
        <tbody>
          {list.length === 0 ? (
            <tr><td colSpan={6} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : list.map((r, i) => (
            <tr key={r.id}>
              <td className="whitespace-nowrap text-center">
                <input type="checkbox" aria-label={`${r.name} 선택`} checked={picked.has(r.id)}
                       onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n })} />
                {' '}{i + 1}
              </td>
              <td className="text-center">{r.kindName}</td>
              <td><button className="ec-link" onClick={() => { setFormError(''); setForm(toForm(r)) }}>{r.name}</button></td>
              <td>{r.regNoFront}</td>
              <td>{r.tradeName ?? ''}</td>
              <td>{r.bizRegNo ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {form && (
        <Modal open error={formError} title="소득자등록" width={640} onClose={() => setForm(null)}>
          <ul className="ec-form [&>li>.title]:basis-[150px]">
            <EcCond label="구분" span={2}>
              {([['CORPORATE', '법인'], ['INDIVIDUAL', '개인']] as const).map(([v, l]) => (
                <label key={v} className="inline-flex items-center gap-[3px] mr-[10px]">
                  <input type="radio" name="payee-kind" checked={form.kind === v} onChange={() => set({ kind: v })} /> {l}
                </label>
              ))}
            </EcCond>
            {([
              ['사업자등록번호', 'bizRegNo'], ['주민(법인)등록번호', 'regNo'], ['상호', 'tradeName'], ['성명(대표자명)', 'name'],
              ['주소', 'address'], ['영문명', 'englishName'], ['사업장소재지', 'bizAddress'],
            ] as const).map(([label, key]) => (
              <EcCond key={key} label={label} span={2}>
                <input className="ec-input w-full" placeholder={label} value={form[key]} onChange={(e) => set({ [key]: e.target.value })} />
              </EcCond>
            ))}
            <EcCond label="소득자구분코드" span={2}>
              <CodePickerField label="소득자구분코드" hideLabel fill emptyLabel="(선택 안 함)" value={form.payeeKindCode}
                               onChange={(v) => set({ payeeKindCode: v })}
                               items={payeeKinds.map((c) => ({ value: c.code, code: c.code, name: c.name }))} />
            </EcCond>
            <EcCond label="업종구분코드" span={2}>
              <CodePickerField label="업종구분코드" hideLabel fill emptyLabel="(선택 안 함)" value={form.industryCode}
                               onChange={(v) => set({ industryCode: v })}
                               items={industries.map((c) => ({ value: c.code, code: c.code, name: c.name }))} />
            </EcCond>
            {([['은행명', 'bankName'], ['계좌(증서)번호', 'accountNo']] as const).map(([label, key]) => (
              <EcCond key={key} label={label} span={2}>
                <input className="ec-input w-full" placeholder={label} value={form[key]} onChange={(e) => set({ [key]: e.target.value })} />
              </EcCond>
            ))}
            <EcCond label="기타구분" span={2}>
              <div className="flex flex-col items-start gap-[4px] w-full">
              <div>
                {([['nonResident', '비거주자'], ['foreigner', '외국인'], ['nonRealName', '비실명(이자/배당소득용)']] as const).map(([key, l]) => (
                  <label key={key} className="inline-flex items-center gap-[3px] mr-[10px]">
                    <input type="checkbox" checked={form[key]} onChange={(e) => set({ [key]: e.target.checked })} /> {l}
                  </label>
                ))}
              </div>
              <label className="flex items-center gap-[6px] w-full">
                생년월일
                <input className="ec-input flex-1" placeholder="YYYYMMDD" value={form.birthDate} onChange={(e) => set({ birthDate: e.target.value })} />
              </label>
              </div>
            </EcCond>
            {([['계정코드', 'accountCode'], ['모바일', 'mobile'], ['Email', 'email']] as const).map(([label, key]) => (
              <EcCond key={key} label={label} span={2}>
                <input className="ec-input w-full" placeholder={label} value={form[key]} onChange={(e) => set({ [key]: e.target.value })} />
              </EcCond>
            ))}
            <EcCond label="적요" span={2}>
              <textarea className="ec-input w-full" rows={3} placeholder="적요" value={form.memo} onChange={(e) => set({ memo: e.target.value })} />
            </EcCond>
          </ul>
          <div className="flex gap-[6px] mt-[12px]">
            <button className="ec-btn ec-btn-primary" onClick={save}>저장(F8)</button>
            <button className="ec-btn" onClick={() => setForm(id(form))}>다시 작성</button>
            <button className="ec-btn" onClick={() => setForm(null)}>닫기</button>
          </div>
        </Modal>
      )}
    </EcListShell>
  )
}

/** [다시 작성] — 고치던 소득자면 그 id 만 남기고 칸을 비운다. */
function id(f: Form): Form {
  return { ...EMPTY, id: f.id }
}
