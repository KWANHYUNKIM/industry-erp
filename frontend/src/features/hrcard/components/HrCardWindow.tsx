import { Fragment, useEffect, useState, type ReactNode } from 'react'
import Modal from '../../../components/Modal'
import CodePickerField from '../../../components/CodePickerField'
import EcHistoryButton from '../../../components/EcHistory'
import { ecConfirm } from '../../../components/EcDialog'
import { api, extractErrorMessage } from '../../../api/client'
import { bankItems, bankNameOf } from '../../../utils/bankCodes'
import { ymd } from '../../../utils/periods'
import type { EmployeeMaster } from '../../../types/api'

/** 인사카드 창 사원 곁 자료(서버 EmployeeProfileDtos.Profile) — 값은 모두 글자로 든다. */
const PROFILE_KEYS = [
  'passportNo', 'homeless',
  'headName', 'headRelation', 'residentPhone', 'familyOrigin', 'domicile', 'residentZip', 'residentAddress', 'birthDate', 'lunar', 'married', 'weddingDate',
  'disabled', 'healthAcquired', 'healthLost', 'healthCardNo', 'pensionAcquired', 'pensionLost', 'veteran', 'veteranRelation', 'militaryType',
  'militaryBranch', 'militaryUnmet', 'militaryRank',
  'refName', 'refRelation', 'refCompany', 'refPhone', 'refDuty', 'refZip', 'refAddress',
  'bondCompany', 'bondNo', 'bondPhone', 'bondAmount', 'bondFrom', 'bondTo',
  'text1', 'text2', 'text3', 'num1', 'num2', 'num3', 'yn1', 'yn2', 'yn3', 'date1', 'date2', 'date3', 'code1', 'code2', 'code3',
] as const
type PKey = (typeof PROFILE_KEYS)[number]
type Profile = Record<PKey, string>
const blankProfile = (): Profile => Object.fromEntries(PROFILE_KEYS.map((k) => [k, ''])) as Profile
const NUMERIC: PKey[] = ['bondAmount', 'num1', 'num2', 'num3']

const GROUPS = {
  신상명세서: ['headName', 'headRelation', 'residentPhone', 'familyOrigin', 'domicile', 'residentZip', 'residentAddress', 'birthDate', 'lunar', 'married', 'weddingDate',
    'disabled', 'healthAcquired', 'healthLost', 'healthCardNo', 'pensionAcquired', 'pensionLost', 'veteran', 'veteranRelation', 'militaryType', 'militaryBranch', 'militaryUnmet', 'militaryRank'],
  추천인: ['refName', 'refRelation', 'refCompany', 'refPhone', 'refDuty', 'refZip', 'refAddress'],
  보증보험: ['bondCompany', 'bondNo', 'bondPhone', 'bondAmount', 'bondFrom', 'bondTo'],
} as const satisfies Record<string, readonly PKey[]>
type Group = keyof typeof GROUPS

/** 원본 신상정보 세 창의 칸(2026-10-22 실측) — 이름표 · 열쇠 · 종류 */
type Kind = 'text' | 'date' | 'radio' | 'num'
const GROUP_FIELDS: Record<Group, { label: string; key: PKey; kind?: Kind; options?: [string, string][] }[]> = {
  신상명세서: [
    { label: '세대주 성명', key: 'headName' }, { label: '세대주와의 관계', key: 'headRelation' }, { label: '주민등록상 전화', key: 'residentPhone' },
    { label: '본관', key: 'familyOrigin' }, { label: '본적', key: 'domicile' }, { label: '우편번호', key: 'residentZip' },
    { label: '주민등록상 주소', key: 'residentAddress' }, { label: '생년월일', key: 'birthDate', kind: 'date' },
    { label: '양력/음력', key: 'lunar', kind: 'radio', options: [['N', '양력'], ['Y', '음력']] },
    { label: '결혼유무', key: 'married', kind: 'radio', options: [['N', 'N'], ['Y', 'Y']] }, { label: '결혼기념일', key: 'weddingDate', kind: 'date' },
    { label: '장애구분', key: 'disabled', kind: 'radio', options: [['N', 'N'], ['Y', 'Y']] },
    { label: '건강보험 취득일', key: 'healthAcquired', kind: 'date' }, { label: '건강보험 상실일', key: 'healthLost', kind: 'date' }, { label: '건강보험증 번호', key: 'healthCardNo' },
    { label: '국민연금 취득일', key: 'pensionAcquired', kind: 'date' }, { label: '국민연금 상실일', key: 'pensionLost', kind: 'date' },
    { label: '보훈자구분', key: 'veteran', kind: 'radio', options: [['N', '비대상'], ['Y', '대상']] }, { label: '보훈자와의 관계', key: 'veteranRelation' },
    { label: '병역구분', key: 'militaryType' }, { label: '군별', key: 'militaryBranch' }, { label: '미필사유', key: 'militaryUnmet' }, { label: '계급', key: 'militaryRank' },
  ],
  추천인: [
    { label: '성명', key: 'refName' }, { label: '본인과의 관계', key: 'refRelation' }, { label: '회사명', key: 'refCompany' }, { label: '전화', key: 'refPhone' },
    { label: '직책', key: 'refDuty' }, { label: '우편번호', key: 'refZip' }, { label: '주소', key: 'refAddress' },
  ],
  보증보험: [
    { label: '회사명', key: 'bondCompany' }, { label: '보증 번호', key: 'bondNo' }, { label: '전화', key: 'bondPhone' }, { label: '보증 금액', key: 'bondAmount', kind: 'num' },
    { label: '보증기간 시작일', key: 'bondFrom', kind: 'date' }, { label: '보증기간 종료일', key: 'bondTo', kind: 'date' },
  ],
}

const JOB_POSITIONS: [string, string][] = [
  ['300', '과장'], ['200', '대리'], ['600', '대표이사'], ['700', '부장'], ['100', '사원'], ['500', '이사'], ['400', '차장'],
]
const TABS = ['기본', '사원정보', '추가정보', '신상정보', '인사자료', '기타설정'] as const
type Tab = (typeof TABS)[number]

interface EmpForm {
  code: string; name: string; foreignName1: string; foreignName2: string; household: string
  departmentId: string; projectId: string; jobTitle: string; duty: string; phone: string; mobile: string; email: string
  hireDate: string; hireKind: string; resignDate: string; resignReason: string
  bankCode: string; bankName: string; accountNo: string; accountHolder: string; zipcode: string; address: string; remark: string
}
const blankEmp = (): EmpForm => ({
  code: '', name: '', foreignName1: '', foreignName2: '', household: '세대주', departmentId: '', projectId: '', jobTitle: '', duty: '',
  phone: '', mobile: '', email: '', hireDate: ymd(new Date()), hireKind: '', resignDate: '', resignReason: '',
  bankCode: '', bankName: '', accountNo: '', accountHolder: '', zipcode: '', address: '', remark: '',
})
const empOf = (e: EmployeeMaster): EmpForm => ({
  code: e.code, name: e.name, foreignName1: e.foreignName1 ?? '', foreignName2: e.foreignName2 ?? '', household: e.household ?? '세대주',
  departmentId: e.departmentId ? String(e.departmentId) : '', projectId: e.projectId ? String(e.projectId) : '', jobTitle: e.jobTitle ?? '', duty: e.duty ?? '',
  phone: e.phone ?? '', mobile: e.mobile ?? '', email: e.email ?? '', hireDate: e.hireDate ?? '', hireKind: e.hireKind ?? '',
  resignDate: e.resignDate ?? '', resignReason: e.resignReason ?? '',
  bankCode: e.bankCode ?? '', bankName: e.bankName ?? '', accountNo: e.accountNo ?? '', accountHolder: e.accountHolder ?? '',
  zipcode: e.zipcode ?? '', address: e.address ?? '', remark: e.remark ?? '',
})
const profileBody = (p: Profile) => Object.fromEntries(PROFILE_KEYS.map((k) => [k, p[k] === '' ? null : NUMERIC.includes(k) ? Number(p[k].replace(/,/g, '')) : p[k]]))

function Field({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return <li className={wide ? 'wide' : undefined}><span className="title">{label}</span><div className="form">{children}</div></li>
}
const inputCls = 'ec-input w-full'

/**
 * 인사카드등록 창(원본 E020603, 2026-10-21~22 실측) — 탭 기본 · 사원정보 · 추가정보 · 신상정보 · 인사자료 · 기타설정,
 * 아래 [저장(F8)] [복사] [다시 작성] [삭제] [닫기] [H].
 * [복사] 는 같은 창에서 사원번호만 비우고 나머지는 둔 신규(단추 저장(F8)▲ · 다시 작성 · 닫기), 신규의 [다시 작성] 은 빈 폼 + 다음 사원번호 + 입사일자 오늘.
 * 사진 · 첨부 · UserPay비밀번호 · 주민등록번호 · 근무시간 설정은 두지 않는다(개인정보 · 보안 · 파일).
 */
export default function HrCardWindow({ card, isNew, departments, projects, hrTab, onClose, onSaved, onReopen }: {
  card: EmployeeMaster | null
  isNew: boolean
  departments: { id: number; code?: string | null; name: string }[]
  projects: { id: number; code: string; name: string }[]
  /** [인사자료] 탭 안 — 열한 항목의 [입력] 줄(페이지가 창을 연다) */
  hrTab: ReactNode
  onClose: () => void
  onSaved: () => void
  /** 복사 · 저장 뒤 새 사원 id 로 이 창을 다시 연다 */
  onReopen: (id: number) => void
}) {
  const open = isNew || !!card
  const [tab, setTab] = useState<Tab>('기본')
  const [form, setForm] = useState<EmpForm>(blankEmp())
  const [profile, setProfile] = useState<Profile>(blankProfile())
  const [copyMode, setCopyMode] = useState(false)
  const [error, setError] = useState('')
  const [bad, setBad] = useState(false)
  const [sub, setSub] = useState<Group | null>(null)
  const [saveMenu, setSaveMenu] = useState(false)
  const [subDraft, setSubDraft] = useState<Profile>(blankProfile())
  const editId = !isNew && !copyMode ? card?.id ?? null : null
  const fresh = editId === null

  async function nextCode() {
    try { const r = await api.get<{ code: string }>('/employees/next-code'); setForm((f) => (f.code ? f : { ...f, code: r.data.code })) } catch { /* 서버가 매긴다 */ }
  }
  async function load() {
    setError(''); setBad(false); setCopyMode(false); setTab('기본')
    if (isNew || !card) { setForm(blankEmp()); setProfile(blankProfile()); void nextCode(); return }
    setForm(empOf(card))
    try {
      const r = await api.get<Record<PKey, unknown>>(`/employees/${card.id}/profile`)
      setProfile(Object.fromEntries(PROFILE_KEYS.map((k) => [k, r.data[k] == null ? '' : String(r.data[k])])) as Profile)
    } catch { setProfile(blankProfile()) }
  }
  useEffect(() => { if (open) void load() }, [open, card?.id, isNew]) // eslint-disable-line react-hooks/exhaustive-deps

  const f = (patch: Partial<EmpForm>) => setForm((x) => ({ ...x, ...patch }))
  const p = (patch: Partial<Profile>) => setProfile((x) => ({ ...x, ...patch }))
  const text = (k: keyof EmpForm, ph?: string) => <input className={inputCls} value={form[k]} placeholder={ph ?? ''} onChange={(e) => f({ [k]: e.target.value } as Partial<EmpForm>)} />

  function body() {
    return {
      name: form.name.trim(), departmentId: form.departmentId ? Number(form.departmentId) : null, jobTitle: form.jobTitle.trim() || null,
      hireDate: form.hireDate || null, phone: form.phone.trim() || null, email: form.email.trim() || null, remark: form.remark.trim() || null,
      mobile: form.mobile.trim() || null, resignReason: form.resignReason.trim() || null, zipcode: form.zipcode.trim(),
      foreignName1: form.foreignName1.trim(), foreignName2: form.foreignName2.trim(), household: form.household,
      address: form.address.trim() || null, bankCode: form.bankCode.trim() || null, bankName: form.bankName.trim() || null,
      accountNo: form.accountNo.trim() || null, accountHolder: form.accountHolder.trim() || null,
      hireKind: form.hireKind, duty: form.duty, projectId: form.projectId ? Number(form.projectId) : null,
    }
  }

  async function save(): Promise<number | null> {
    if (!form.name.trim()) { setBad(true); setTab('기본'); return null }
    setError('')
    try {
      let id = editId
      if (id) {
        await api.put(`/employees/${id}`, { ...body(), searchKeyword: card?.searchKeyword ?? null, baseSalary: card?.baseSalary ?? null, payType: card?.payType, resignDate: form.resignDate || null, active: !form.resignDate })
      } else {
        id = (await api.post<{ id: number }>('/employees', { ...body(), code: form.code.trim() || null })).data.id
      }
      await api.put(`/employees/${id}/profile`, profileBody(profile))
      return id
    } catch (e) { setError(extractErrorMessage(e)); return null }
  }
  async function saveClose() { if (await save()) { onSaved(); onClose() } }
  async function saveNew() { if (await save()) { onSaved(); resetNew() } }
  async function saveKeep() { const id = await save(); if (id) { onSaved(); onReopen(id) } }

  /** 신규: 빈 폼 + 다음 사원번호 + 입사일자 오늘 */
  function resetNew() { setForm(blankEmp()); setProfile(blankProfile()); setBad(false); setError(''); void nextCode() }
  function copy() { setCopyMode(true); setForm((x) => ({ ...x, code: '' })); void nextCode() }
  async function remove() {
    if (!editId || !(await ecConfirm('한번 지워진 자료는 복구될 수 없습니다.\n\n삭제하겠습니까?'))) return
    try { await api.delete(`/employees/${editId}`); onSaved(); onClose() } catch (e) { setError(extractErrorMessage(e)) }
  }

  // ─ 칸 하나씩 ─
  const E: Record<string, ReactNode> = {
    '사원번호': <Field key="사원번호" label="사원번호">{fresh ? text('code') : <span>{form.code}</span>}</Field>,
    '성명': <Field key="성명" label="성명"><input className={`${inputCls}${bad && !form.name.trim() ? ' border-ec-danger' : ''}`} aria-invalid={bad && !form.name.trim()} placeholder="성명" value={form.name} onChange={(e) => f({ name: e.target.value })} /></Field>,
    '외국어성명2': <Field key="외국어성명2" label="외국어성명2">{text('foreignName2', '외국어성명2')}</Field>,
    '외국어성명1': <Field key="외국어성명1" label="외국어성명1">{text('foreignName1', '외국어성명1')}</Field>,
    '세대주여부': <Field key="세대주여부" label="세대주여부"><div className="flex flex-wrap gap-[10px]">{['세대주', '세대원', '세대주의 배우자'].map((h) => (
      <label key={h} className="inline-flex items-center gap-[4px]"><input type="radio" name="hc-household" checked={form.household === h} onChange={() => f({ household: h })} /> {h}</label>))}</div></Field>,
    '부서코드': <Field key="부서코드" label="부서코드"><CodePickerField label="" placeholder="부서코드" emptyLabel="선택 해제" value={form.departmentId} onChange={(v) => f({ departmentId: v })}
      items={departments.map((d) => ({ value: String(d.id), code: d.code ?? undefined, name: d.name }))} /></Field>,
    '프로젝트': <Field key="프로젝트" label="프로젝트"><CodePickerField label="" placeholder="프로젝트" emptyLabel="선택 해제" value={form.projectId} onChange={(v) => f({ projectId: v })}
      items={projects.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} /></Field>,
    '직위/직급': <Field key="직위/직급" label="직위/직급"><CodePickerField label="직위/직급" hideLabel fill placeholder="직위/직급" emptyLabel="선택 해제" value={form.jobTitle} onChange={(v) => f({ jobTitle: v })}
      items={[...JOB_POSITIONS.map(([code, name]) => ({ value: name, code, name })), ...(form.jobTitle && !JOB_POSITIONS.some(([, n]) => n === form.jobTitle) ? [{ value: form.jobTitle, name: form.jobTitle }] : [])]} /></Field>,
    '직책': <Field key="직책" label="직책"><CodePickerField label="직책" hideLabel fill placeholder="직책" emptyLabel="선택 해제" value={form.duty} onChange={(v) => f({ duty: v })}
      items={[{ value: '팀원', code: '100', name: '팀원' }, { value: '팀장', code: '200', name: '팀장' }, ...(form.duty && !['팀원', '팀장'].includes(form.duty) ? [{ value: form.duty, name: form.duty }] : [])]} /></Field>,
    '전화': <Field key="전화" label="전화">{text('phone', '전화')}</Field>,
    '모바일': <Field key="모바일" label="모바일">{text('mobile', '모바일')}</Field>,
    '여권번호': <Field key="여권번호" label="여권번호"><input className={inputCls} placeholder="여권번호" value={profile.passportNo} onChange={(e) => p({ passportNo: e.target.value })} /></Field>,
    'Email': <Field key="Email" label="Email">{text('email', 'Email')}</Field>,
    '입사일자': <Field key="입사일자" label="입사일자"><input type="date" className={inputCls} value={form.hireDate} onChange={(e) => f({ hireDate: e.target.value })} /></Field>,
    '입사구분': <Field key="입사구분" label="입사구분"><CodePickerField label="입사구분" hideLabel fill placeholder="입사구분" emptyLabel="선택 해제" value={form.hireKind} onChange={(v) => f({ hireKind: v })}
      items={[{ value: '신입', code: '100', name: '신입' }, { value: '경력', code: '200', name: '경력' }, ...(form.hireKind && !['신입', '경력'].includes(form.hireKind) ? [{ value: form.hireKind, name: form.hireKind }] : [])]} /></Field>,
    '퇴사일자': <Field key="퇴사일자" label="퇴사일자"><input type="date" className={inputCls} value={form.resignDate} onChange={(e) => f({ resignDate: e.target.value })} /></Field>,
    '퇴사사유': <Field key="퇴사사유" label="퇴사사유">{text('resignReason', '퇴사사유')}</Field>,
    '급여통장': <Field key="급여통장" label="급여통장" wide><div className="flex gap-[6px] w-full mobile:flex-col">
      <div className="flex-1"><CodePickerField label="은행" hideLabel fill pair placeholder="은행" emptyLabel="선택 해제" value={form.bankCode}
        onChange={(v, it) => f({ bankCode: v, bankName: it?.name ?? '' })}
        items={form.bankCode && !bankNameOf(form.bankCode) ? [...bankItems(), { value: form.bankCode, code: form.bankCode, name: form.bankName }] : bankItems()} /></div>
      <input className="ec-input flex-1" value={form.accountNo} onChange={(e) => f({ accountNo: e.target.value })} placeholder="계좌번호" />
      <input className="ec-input flex-1" value={form.accountHolder} onChange={(e) => f({ accountHolder: e.target.value })} placeholder="예금주" />
    </div></Field>,
    '주소': <Field key="주소" label="주소" wide><input className="ec-input w-[110px] mb-[4px]" value={form.zipcode} onChange={(e) => f({ zipcode: e.target.value })} placeholder="우편번호" maxLength={10} />
      <textarea className={inputCls} rows={2} value={form.address} onChange={(e) => f({ address: e.target.value })} placeholder="주소" /></Field>,
    '적요': <Field key="적요" label="적요" wide><textarea className={inputCls} rows={2} value={form.remark} onChange={(e) => f({ remark: e.target.value })} placeholder="적요" /></Field>,
    '생년월일': <Field key="생년월일" label="생년월일"><input type="date" className="ec-input w-[150px]" value={profile.birthDate} onChange={(e) => p({ birthDate: e.target.value })} /></Field>,
    '무주택자 여부': <Field key="무주택자 여부" label="무주택자 여부"><div className="flex gap-[12px]">
      {([['Y', '여(무주택자)'], ['N', '부(유주택자)']] as const).map(([v, l]) => (
        <label key={v} className="inline-flex items-center gap-[4px]"><input type="radio" name="hc-homeless" checked={profile.homeless === v} onChange={() => p({ homeless: v })} /> {l}</label>))}</div></Field>,
  }
  const fields = (...ns: string[]) => ns.map((n) => E[n])
  const head = fields('사원번호', '성명')

  const extra = (['text', 'num', 'yn', 'date', 'code'] as const).flatMap((t) => [1, 2, 3].map((n) => {
    const k = `${t}${n}` as PKey
    const label = { text: '문자형식', num: '숫자형식', yn: 'Y/N형식', date: '일자형식', code: '코드형식' }[t] + n
    return (
      <Field key={k} label={label}>
        {t === 'yn' ? (
          <span className="inline-flex gap-[12px]">{['Y', 'N'].map((v) => (
            <label key={v} className="inline-flex items-center gap-[4px]"><input type="radio" name={`hc-${k}`} checked={profile[k] === v} onChange={() => p({ [k]: v } as Partial<Profile>)} /> {v}</label>))}</span>
        ) : t === 'date' ? <input type="date" className="ec-input w-[150px]" value={profile[k]} onChange={(e) => p({ [k]: e.target.value } as Partial<Profile>)} />
          : <input className={`${inputCls}${t === 'num' ? ' text-right' : ''}`} inputMode={t === 'num' ? 'decimal' : undefined} value={profile[k]}
                   onChange={(e) => p({ [k]: t === 'num' ? e.target.value.replace(/[^0-9.-]/g, '') : e.target.value } as Partial<Profile>)} />}
      </Field>
    )
  }))

  const filledOf = (g: Group) => GROUPS[g].some((k) => profile[k] !== '')
  async function saveSub() {
    if (!sub) return
    const next = { ...profile, ...Object.fromEntries(GROUPS[sub].map((k) => [k, subDraft[k]])) } as Profile
    setProfile(next)
    if (editId) {
      try { await api.put(`/employees/${editId}/profile`, profileBody(next)) } catch (e) { setError(extractErrorMessage(e)); return }
    }
    setSub(null)
  }
  async function deleteSub() {
    if (!sub) return
    const next = { ...profile, ...Object.fromEntries(GROUPS[sub].map((k) => [k, ''])) } as Profile
    setProfile(next)
    if (editId) {
      try { await api.put(`/employees/${editId}/profile`, profileBody(next)) } catch (e) { setError(extractErrorMessage(e)); return }
    }
    setSub(null)
  }

  const title = '인사카드등록'
  return (
    <>
      <Modal error={error} open={open} title={title} width={720} onClose={onClose}>{(
        <form onSubmit={(e) => { e.preventDefault(); void saveClose() }}>
          <div className="ec-pills mb-[8px]">
            {TABS.map((t) => <button key={t} type="button" className={`ec-pill no-ec${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</button>)}
          </div>
          {tab === '기본' && <ul className="ec-form">{fields('사원번호', '성명', '외국어성명2', '외국어성명1', '세대주여부', '부서코드', '프로젝트', '직위/직급', '직책', '전화', '모바일', '여권번호', 'Email',
            '입사일자', '입사구분', '퇴사일자', '퇴사사유', '급여통장', '주소', '적요')}</ul>}
          {tab === '사원정보' && <ul className="ec-form">{fields('사원번호', '성명', '생년월일', '부서코드', '프로젝트', '직위/직급', '직책', '전화', '모바일', '여권번호', 'Email',
            '입사일자', '입사구분', '퇴사일자', '퇴사사유', '적요')}</ul>}
          {tab === '추가정보' && <ul className="ec-form">{head}{extra}</ul>}
          {tab === '신상정보' && (
            <ul className="ec-form">
              {head}
              {(['신상명세서', '추천인', '보증보험'] as Group[]).map((g) => (
                <li key={g} className="wide"><span className="title">{g}</span>
                  <div className="form"><button type="button" className={`ec-btn ec-btn-sm${filledOf(g) ? ' ec-btn-primary' : ''}`}
                    onClick={() => { setSubDraft(profile); setSub(g) }}>입력</button></div></li>
              ))}
            </ul>
          )}
          {tab === '인사자료' && <ul className="ec-form">{head}{hrTab}</ul>}
          {tab === '기타설정' && <ul className="ec-form">{head}{fields('세대주여부', '무주택자 여부', '외국어성명2', '외국어성명1', '주소', '급여통장')}
            <Fragment key="발령"><li className="wide"><span className="title">인사발령</span><div className="form"><a href="/hr/assignments/status" target="_blank" rel="noreferrer">인사발령 현황</a></div></li></Fragment></ul>}

          <div className="flex gap-[6px] mt-[12px]">
            {fresh ? (
              <>
                <span className="relative inline-flex">
                  <button type="button" className="ec-btn ec-btn-primary" onClick={() => void saveClose()}>저장(F8)</button>
                  <button type="button" className="ec-btn ec-btn-primary" aria-label="저장 방법" onClick={() => setSaveMenu((v) => !v)}>▲</button>
                  {saveMenu && (
                    <div className="ec-menu absolute bottom-full left-0 mb-[2px] min-w-[120px]">
                      <button type="button" onClick={() => { setSaveMenu(false); void saveKeep() }}>저장/내용유지</button>
                      <button type="button" onClick={() => { setSaveMenu(false); void saveNew() }}>저장/신규</button>
                    </div>
                  )}
                </span>
                <button type="button" className="ec-btn" onClick={resetNew}>다시 작성</button>
                <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
              </>
            ) : (
              <>
                <button type="button" className="ec-btn ec-btn-primary" onClick={() => void saveClose()}>저장(F8)</button>
                <button type="button" className="ec-btn" onClick={copy}>복사</button>
                <button type="button" className="ec-btn" onClick={() => void load()}>다시 작성</button>
                <button type="button" className="ec-btn" onClick={() => void remove()}>삭제</button>
                <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
                <EcHistoryButton target="EMPLOYEE" id={card?.id} numbered head={`사원코드: ${card?.code ?? ''}`} />
              </>
            )}
          </div>
        </form>
      )}</Modal>

      <Modal open={!!sub} title={sub ?? ''} width={560} onClose={() => setSub(null)}>{(
        <>
          <ul className="ec-form">
            {sub && GROUP_FIELDS[sub].map((c) => (
              <Field key={c.key} label={c.label}>
                {c.kind === 'date' ? <input type="date" className="ec-input w-[150px]" value={subDraft[c.key]} onChange={(e) => setSubDraft({ ...subDraft, [c.key]: e.target.value })} />
                  : c.kind === 'radio' ? <span className="inline-flex gap-[12px]">{c.options!.map(([v, l]) => (
                    <label key={v} className="inline-flex items-center gap-[4px]"><input type="radio" name={`sub-${c.key}`} checked={subDraft[c.key] === v} onChange={() => setSubDraft({ ...subDraft, [c.key]: v })} /> {l}</label>))}</span>
                  : <input className={`${inputCls}${c.kind === 'num' ? ' text-right' : ''}`} value={subDraft[c.key]}
                           onChange={(e) => setSubDraft({ ...subDraft, [c.key]: c.kind === 'num' ? e.target.value.replace(/[^0-9]/g, '') : e.target.value })} />}
              </Field>
            ))}
          </ul>
          <div className="flex gap-[6px] mt-[12px]">
            <button type="button" className="ec-btn ec-btn-primary" onClick={() => void saveSub()}>저장(F8)</button>
            <button type="button" className="ec-btn" onClick={() => void deleteSub()}>삭제</button>
            <button type="button" className="ec-btn" onClick={() => setSub(null)}>닫기</button>
          </div>
        </>
      )}</Modal>
    </>
  )
}
