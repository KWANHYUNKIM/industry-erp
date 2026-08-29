import { useEffect, useState, type FormEvent } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { CodeOption, GroupMaster, Partner } from '../../api/types'
import { useSearchParams } from 'react-router-dom'
import { useTableSort } from '../../utils/useTableSort'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import EcFileDrop from '../../components/EcFileDrop'
import CodePickerField from '../../components/CodePickerField'
import GroupMasterModal from '../../components/GroupMasterModal'

const inputCls = 'ec-input w-full'

const empty = {
  code: '', name: '', type: 'CUSTOMER', bizRegNo: '', ceoName: '',
  bizType: '', bizItem: '', manager: '', phone: '', mobile: '',
  /** 원본 거래처관리대장 I 머리말이 찍는 값들. */
  email: '', fax: '', creditLimit: '0',
  bankName: '', accountNo: '', accountHolder: '',
  postalCode: '', address: '', partnerGroupId: '',
  /** 원본 [관계설정]의 대표거래처. 비우면 자기가 곧 대표다. */
  parentId: '',
  salesPriceGroup: '', purchasePriceGroup: '', searchKeyword: '',
  regNoKind: '사업자등록번호', industryKind: '일반', udiSupplyShape: '', subBizNo: '',
  postalCode2: '', address2: '', homepage: '', remark: '',
  taxReport: true, shipmentTarget: true,
  /**
   * 사용구분. 예전에는 저장할 때 늘 true 를 보냈다 —
   * <b>사용중단한 거래처를 고치기만 해도 조용히 되살아났다.</b>
   */
  active: true,
}

/**
 * 원본 거래처등록 창의 탭 실측(사본): <b>기본 · 거래처정보 · 여신/단가 · 부가정보</b>.
 * [기본] 탭 항목은 거래처코드 · 상호(이름) · 대표자명 · 업태 · 종목 · 전화 ·
 * 주소1 우편번호 · [주소검색] · 주소1 이다.
 *
 * <p>우리는 한 판에 열여섯 칸을 늘어놓고 있었다. 항목이 늘 때마다 더 길어지기만 해서
 * 자주 쓰는 [기본]까지 스크롤해야 했다. 나머지 탭 항목은 원본을 열어 보지 못해
 * (탭을 누르기 전에는 DOM 에 없다) 우리 값을 뜻에 맞게 나눠 담았다.
 */
const FORM_TABS = ['기본', '거래처정보', '여신/단가', '부가정보'] as const
type FormTab = typeof FORM_TABS[number]

export default function PartnersPage() {
  const [partners, setPartners] = useState<Partner[]>([])
  const [types, setTypes] = useState<CodeOption[]>([])
  const [partnerGroups, setPartnerGroups] = useState<GroupMaster[]>([])
  const [loading, setLoading] = useState(true)
  const [checked, setChecked] = useState<Set<number>>(new Set())
  /**
   * 원본 거래처리스트의 [사용중단포함] 체크. <b>기본은 꺼져 있다</b> —
   * 즉 기본 화면에는 사용중단 거래처가 안 나온다. 우리는 늘 다 보여 줬다.
   */
  const [withStopped, setWithStopped] = useState(false)
  /*
   * 다른 화면에서 <b>거래처를 물고</b> 넘어올 때 그 거래처만 남긴다(?q=코드 또는 이름).
   * 거래처특별단가그룹에서 이름을 누르면 여기로 오는데, 걸러 주지 않으면
   * 300곳짜리 목록 한가운데에 떨어뜨려 놓는 셈이다.
   */
  const [searchParams] = useSearchParams()
  const [keyword, setKeyword] = useState(searchParams.get('q') ?? '')
  /*
   * 원본 [거래처관리대장 II]는 <b>거래처를 찾는 화면</b>이다 — 조건 판에 상호·대표자명·
   * 업태·종목·전화·Email·주소·검색창내용·사업자번호 …가 다 있다.
   * 우리는 검색창 하나뿐이라 코드·상호로만 좁힐 수 있었다. 거래처가 300곳을 넘으면
   * "그 대표자 이름이 뭐였더라" 로는 찾을 길이 없었다.
   *
   * <p>원본 조건 이름을 그대로 쓰되, <b>우리 거래처에 있는 값만</b> 둔다.
   */
  const [cond, setCond] = useState({
    /* 원본 조건 판의 차례 그대로다 — 상호 다음이 종사업장번호, 그 다음이 대표자명이다. */
    '상호(이름)': '', 종사업장번호: '', 대표자명: '', 업태: '', 종목: '', 전화: '',
    Email: '', 주소1: '', 검색창내용: '',
  })
  const setCd = (k: keyof typeof cond, v: string) => setCond((c) => ({ ...c, [k]: v }))
  const hit = (v: string | null, q: string) => !q || (v ?? '').includes(q.trim())

  /** 화면에 보이는 거래처. 사용중단은 체크를 켜야 나온다 — 원본도 그렇다. */
  const shownRows = partners
    .filter((p) => withStopped || p.active)
    .filter((p) => !keyword || `${p.code} ${p.name}`.includes(keyword.trim()))
    .filter((p) => hit(p.name, cond['상호(이름)']) && hit(p.ceoName, cond.대표자명)
      && hit(p.bizType, cond.업태) && hit(p.bizItem, cond.종목)
      && hit(p.phone, cond.전화) && hit(p.email, cond.Email)
      && hit(p.address, cond.주소1) && hit(p.searchKeyword, cond.검색창내용)
      && hit(p.subBizNo, cond.종사업장번호))

  /*
   * 원본은 목록 머리를 눌러 정렬한다(사본 열의 78%에 정렬 표시가 붙어 있다).
   * 우리는 <b>▼ 를 그려 놓고 정렬 코드가 한 줄도 없었다</b> — 눌러도 아무 일이 없었다.
   */
  const sort = useTableSort(shownRows, {
    거래처코드: (p) => p.code,
    거래처명: (p) => p.name,
    구분: (p) => p.typeName,
    사업자번호: (p) => p.bizRegNo,
    대표자명: (p) => p.ceoName,
    거래처그룹: (p) => p.partnerGroupName,
    담당자: (p) => p.manager,
    전화: (p) => p.phone,
    모바일: (p) => p.mobile,
    검색창내용: (p) => p.searchKeyword,
  })
  const shown = sort.sorted
  const [formTab, setFormTab] = useState<FormTab>('기본')
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  /**
   * 수정 대상 거래처 id. null 이면 신규.
   *
   * <p>여기에 수정이 아예 없었다. 거래처는 한 번 등록하면 상호도 담당자도 고칠 수 없어서
   * 오타가 나면 지우고 다시 만드는 수밖에 없었는데, 전표가 걸린 거래처는 삭제도 막혀 있다.
   * 원본 거래처등록은 목록에서 행을 열어 [저장(F8)] 한다.
   */
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState({ ...empty })
  const [groupOpen, setGroupOpen] = useState(false)  // 계층그룹 모달
  const [webOpen, setWebOpen] = useState(false)      // 웹자료올리기 모달
  const [webFile, setWebFile] = useState<{ name: string; total: number; head: string[] } | null>(null)
  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    const text = await f.text()
    const lines = text.split(/\r?\n/).filter((l) => l.trim())
    setWebFile({ name: f.name, total: Math.max(0, lines.length - 1), head: (lines[0] ?? '').split(/[,\t]/).slice(0, 8) })
  }

  async function load() {
    setLoading(true)
    try {
      const [p, t, g] = await Promise.all([
        api.get<Partner[]>('/partners'),
        api.get<CodeOption[]>('/meta/partner-types'),
        api.get<GroupMaster[]>('/partner-groups'),
      ])
      setPartners(p.data)
      setTypes(t.data)
      setPartnerGroups(g.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  function set(f: keyof typeof form, v: string) {
    setForm((prev) => ({ ...prev, [f]: v }))
  }

  function openCreate() {
    setEditId(null)
    setForm({ ...empty })
    setFormTab('기본')
    setShowForm(true)
  }

  function openEdit(p: Partner) {
    setEditId(p.id)
    setForm({
      code: p.code, name: p.name, type: p.type,
      bizRegNo: p.bizRegNo ?? '', ceoName: p.ceoName ?? '',
      bizType: p.bizType ?? '', bizItem: p.bizItem ?? '',
      manager: p.manager ?? '', phone: p.phone ?? '', mobile: p.mobile ?? '',
      bankName: p.bankName ?? '', accountNo: p.accountNo ?? '', accountHolder: p.accountHolder ?? '',
      postalCode: p.postalCode ?? '', address: p.address ?? '',
      email: p.email ?? '', fax: p.fax ?? '', creditLimit: String(p.creditLimit ?? 0),
      salesPriceGroup: p.salesPriceGroup ?? '', purchasePriceGroup: p.purchasePriceGroup ?? '',
      searchKeyword: p.searchKeyword ?? '',
      regNoKind: p.regNoKind ?? '사업자등록번호', industryKind: p.industryKind ?? '일반',
      udiSupplyShape: p.udiSupplyShape ?? '',
      subBizNo: p.subBizNo ?? '', postalCode2: p.postalCode2 ?? '', address2: p.address2 ?? '',
      homepage: p.homepage ?? '', remark: p.remark ?? '',
      taxReport: p.taxReport, shipmentTarget: p.shipmentTarget,
      active: p.active,
      partnerGroupId: p.partnerGroupId != null ? String(p.partnerGroupId) : '',
      parentId: p.parentId != null ? String(p.parentId) : '',
    })
    setShowForm(true)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const body = {
      ...form,
      partnerGroupId: form.partnerGroupId ? Number(form.partnerGroupId) : null,
      parentId: form.parentId ? Number(form.parentId) : null,
      creditLimit: Number(form.creditLimit) || 0,
    }
    try {
      // 거래처코드는 수정 요청에 없다 — 전표가 코드로 묶여 있어 바꾸면 과거 전표와 어긋난다.
      if (editId != null) await api.put(`/partners/${editId}`, body)
      else await api.post('/partners', body)
      setForm({ ...empty })
      setShowForm(false)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  /**
   * 사용중단/재사용 — 원본 거래처리스트의 버튼이다.
   *
   * <p>거래처는 <b>지우면 안 된다.</b> 그 거래처로 끊은 전표가 이미 있는데 지우면
   * 그 전표가 누구와의 거래였는지 잃는다. 원본이 지우기가 아니라 사용중단인 이유가 그것이다.
   * 고른 것이 섞여 있으면 전부 사용중단으로 맞춘다 — 하나씩 뒤집으면 한 번 눌렀을 때
   * 결과가 뭔지 알 수 없다.
   */
  /**
   * 그 거래처를 <b>통째로</b> 만든다. 수정 요청은 통째로 덮으므로, 바꿀 칸만 얹고
   * 나머지는 있는 값 그대로 보내야 한다 — 몇 칸만 보내면 검색창내용·홈페이지·적요·
   * 주소2·단가그룹이 조용히 지워진다(사용중단에서 실제로 겪었다).
   */
  const wholePartner = (x: Partner, patch: Record<string, unknown> = {}) => ({
    name: x.name, type: x.type, bizRegNo: x.bizRegNo, ceoName: x.ceoName,
    bizType: x.bizType, bizItem: x.bizItem, manager: x.manager,
    phone: x.phone, mobile: x.mobile,
    email: x.email, fax: x.fax, creditLimit: x.creditLimit,
    bankName: x.bankName, accountNo: x.accountNo, accountHolder: x.accountHolder,
    postalCode: x.postalCode, address: x.address,
    salesPriceGroup: x.salesPriceGroup, purchasePriceGroup: x.purchasePriceGroup,
    searchKeyword: x.searchKeyword, regNoKind: x.regNoKind, industryKind: x.industryKind,
    udiSupplyShape: x.udiSupplyShape || undefined,
    subBizNo: x.subBizNo, postalCode2: x.postalCode2, address2: x.address2,
    homepage: x.homepage, remark: x.remark,
    taxReport: x.taxReport, shipmentTarget: x.shipmentTarget,
    parentId: x.parentId, partnerGroupId: x.partnerGroupId, active: x.active,
    ...patch,
  })

  /*
   * 원본 거래처리스트의 <b>[변경]</b> — 고른 거래처의 한 칸을 한 번에 바꾼다.
   * 담당자가 바뀌거나 거래처그룹을 다시 나눌 때, 우리는 거래처를 하나씩 열어
   * 고쳐야 했다. 300곳이면 300번이다.
   */
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkField, setBulkField] = useState<'manager' | 'partnerGroupId'>('manager')
  const [bulkValue, setBulkValue] = useState('')

  async function bulkChange() {
    const targets = shown.filter((x) => checked.has(x.id))
    if (targets.length === 0) return setError('바꿀 거래처를 고르세요.')
    setError('')
    const patch = bulkField === 'manager'
      ? { manager: bulkValue || null }
      : { partnerGroupId: bulkValue ? Number(bulkValue) : null }
    const results = await Promise.allSettled(
      targets.map((x) => api.put(`/partners/${x.id}`, wholePartner(x, patch))))
    const failed = results.filter((r) => r.status === 'rejected').length
    setChecked(new Set())
    setBulkOpen(false)
    await load()
    if (failed > 0) setError(`${targets.length - failed}건 변경, ${failed}건 실패.`)
  }

  async function toggleActive() {
    const targets = shown.filter((x) => checked.has(x.id))
    if (targets.length === 0) return setError('사용중단하거나 되살릴 거래처를 고르세요.')
    const reviving = targets.every((x) => !x.active)
    setError('')
    try {
      for (const x of targets) {
        /*
         * <b>그 거래처를 통째로 다시 보낸다.</b> 예전에는 몇 칸만 골라 보냈는데,
         * 수정 요청은 통째로 덮으므로 안 보낸 칸(검색창내용·홈페이지·적요·주소2·
         * 우편번호·단가그룹·세무신고거래처 …)이 <b>사용중단 한 번에 조용히 지워졌다.</b>
         * 창고에서 똑같은 것을 고쳤는데 거래처에도 남아 있었다.
         */
        await api.put(`/partners/${x.id}`, wholePartner(x, { active: reviving }))
      }
      setChecked(new Set())
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  async function remove(p: Partner) {
    if (!confirm(`거래처 '${p.name}'을(를) 삭제할까요?`)) return
    try {
      await api.delete(`/partners/${p.id}`)
      load()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  const typeColor = (t: string) =>
    t === 'CUSTOMER' ? { bg: '#eef4ff', fg: 'var(--ec-blue)' }
      : t === 'SUPPLIER' ? { bg: '#eefaf0', fg: '#2f8401' }
        : { bg: '#f3eefb', fg: '#6b3fb0' }

  return (
    <EcListShell
      title="거래처리스트"
      search={keyword}
      onSearchChange={setKeyword}
      onNew={openCreate}
      actions={[
        // 원본 차례: 계층그룹 · 변경 · 사용중단/재사용 · Excel (사본 실측)
        { label: '계층그룹', onClick: () => setGroupOpen(true) },
        { label: `변경${checked.size ? ` (${checked.size})` : ''}`, onClick: () => {
          if (checked.size === 0) { setError('바꿀 거래처를 고르세요.'); return }
          setError(''); setBulkValue(''); setBulkOpen(true)
        } },
        { label: `사용중단/재사용${checked.size ? ` (${checked.size})` : ''}`, onClick: toggleActive },
        { label: 'Excel' },
        { label: '웹자료올리기', onClick: () => setWebOpen(true) },
      ]}
    >
      {error && <p className="mb-2 rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <label style={{ fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
        <input type="checkbox" checked={withStopped} onChange={(e) => setWithStopped(e.target.checked)} />
        사용중단포함
      </label>

      {/* 원본 거래처검색 조건 판. 이름은 원본 그대로 쓴다. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 8 }}>
        {(Object.keys(cond) as (keyof typeof cond)[]).map((k) => (
          <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <label style={{ fontSize: 12.5, color: '#5a626e' }}>{k}</label>
            <input className="ec-input" style={{ width: 120 }} value={cond[k]}
                   onChange={(e) => setCd(k, e.target.value)} />
          </span>
        ))}
        <button type="button" className="ec-btn" onClick={() => setCond({
          '상호(이름)': '', 종사업장번호: '', 대표자명: '', 업태: '', 종목: '', 전화: '',
          Email: '', 주소1: '', 검색창내용: '',
        })}>조건 지우기</button>
      </div>

      <Modal open={showForm} title={editId ? '거래처수정' : '거래처등록'} onClose={() => setShowForm(false)}>{(
        <form onSubmit={submit} style={{ marginTop: 8, marginBottom: 8, border: '1px solid var(--ec-border)', background: '#fff', padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 8 }}>{editId ? '거래처 수정' : '새 거래처 등록'}</div>
          <ul className="ec-tabs" style={{ marginBottom: 10 }}>
            {FORM_TABS.map((t) => (
              <li key={t} className={`ec-tab${formTab === t ? ' active' : ''}`}
                  onClick={() => setFormTab(t)} style={{ cursor: 'pointer' }}>{t}</li>
            ))}
          </ul>

          {formTab === '기본' && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm text-slate-600">거래처코드 *</label>
              <input className={inputCls} value={form.code} onChange={(e) => set('code', e.target.value)}
                     disabled={editId != null} title={editId != null ? '전표가 코드로 묶여 있어 수정할 수 없습니다.' : undefined} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">상호(이름) *</label>
              <input className={inputCls} value={form.name} onChange={(e) => set('name', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">대표자명</label>
              <input className={inputCls} value={form.ceoName} onChange={(e) => set('ceoName', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">업태</label>
              <input className={inputCls} value={form.bizType} onChange={(e) => set('bizType', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">종목</label>
              <input className={inputCls} value={form.bizItem} onChange={(e) => set('bizItem', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">전화</label>
              <input className={inputCls} value={form.phone} onChange={(e) => set('phone', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">주소1 우편번호</label>
              <input className={inputCls} value={form.postalCode} onChange={(e) => set('postalCode', e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm text-slate-600">주소1</label>
              <input className={inputCls} value={form.address} onChange={(e) => set('address', e.target.value)} />
            </div>
          </div>
          )}

          {formTab === '거래처정보' && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm text-slate-600">구분 *</label>
              <select className={inputCls} value={form.type} onChange={(e) => set('type', e.target.value)}>
                {types.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
              </select>
            </div>
            {/*
              원본 [거래처코드구분]. 그냥 두는 값이 아니다 — 등록번호 자릿수가 여기서 갈린다
              (사업자 10 · 주민 13). 세금계산서에 그대로 찍히는 값이라 서버가 막는다.
            */}
            <div>
              <label className="mb-1 block text-sm text-slate-600">거래처코드구분</label>
              <select className={inputCls} value={form.regNoKind} onChange={(e) => set('regNoKind', e.target.value)}>
                {['사업자등록번호', '주민등록번호', '외국인'].map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">{form.regNoKind === '외국인' ? '등록번호' : form.regNoKind}</label>
              <input className={inputCls} value={form.bizRegNo} onChange={(e) => set('bizRegNo', e.target.value)}
                     placeholder={form.regNoKind === '주민등록번호' ? '숫자 13자리'
                       : form.regNoKind === '외국인' ? '형식 검사 없음' : '숫자 10자리'} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">종사업장번호</label>
              <input className={inputCls} value={form.subBizNo} onChange={(e) => set('subBizNo', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">담당자</label>
              <input className={inputCls} value={form.manager} onChange={(e) => set('manager', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">모바일</label>
              <input className={inputCls} value={form.mobile} onChange={(e) => set('mobile', e.target.value)} />
            </div>
            {/*
              거래처그룹. 채권/채무현황의 그룹 소계와 조건검색의 '그룹 전체'가 이 값을 본다.
              원본 이름은 [거래처그룹1] 이다 — 우리는 그룹이 하나라 '2' 에 해당하는 칸이 없다
              (품목의 [품목그룹1명] 과 같은 관계).
            */}
            <div>
              <CodePickerField
                label="거래처그룹1" placeholder="거래처그룹 선택" emptyLabel="선택 해제"
                value={form.partnerGroupId} onChange={(v) => set('partnerGroupId', v)}
                items={partnerGroups.map((g) => ({ value: String(g.id), code: g.code, name: g.name }))}
              />
            </div>
            {/*
              원본 거래처리스트 하단의 [관계설정]. 지점·사업장별로 거래처코드를 따로 쓰는 회사를
              하나로 묶는다 — 거래처관리대장의 [대표거래처로 합산]이 이 값을 본다.
              자기 자신과 이미 남의 종속인 거래처는 서버가 거절한다(두 단계까지).
            */}
            <div>
              <CodePickerField
                label="대표거래처 (관계설정)" placeholder="대표거래처 선택" emptyLabel="선택 해제"
                value={form.parentId} onChange={(v) => set('parentId', v)}
                items={partners.filter((x) => x.id !== editId && x.parentId == null)
                  .map((x) => ({ value: String(x.id), code: x.code, name: x.name }))}
              />
            </div>
            {/* 원본 거래처관리대장 I 머리말이 찍는 값들 — 우리에겐 적을 자리가 없었다. */}
            <div>
              <label className="mb-1 block text-sm text-slate-600">Email</label>
              <input className={inputCls} value={form.email} onChange={(e) => set('email', e.target.value)}
                     placeholder="세금계산서·거래명세서를 보낼 곳" />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">Fax</label>
              <input className={inputCls} value={form.fax} onChange={(e) => set('fax', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">여신한도</label>
              <input className={inputCls} type="number" value={form.creditLimit}
                     onChange={(e) => set('creditLimit', e.target.value)} style={{ textAlign: 'right' }} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">업종별구분</label>
              <select className={inputCls} value={form.industryKind} onChange={(e) => set('industryKind', e.target.value)}>
                {['일반', '관세사', '외화거래처'].map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
            {/*
              원본 의료기기공급내역보고의 [공급형태]. 전표마다 고르는 것이 아니라
              <b>그 거래처가 어떤 곳인지</b>라서 거래처에 붙는다. 보고 서식이 요구하는
              항목이라 여기서 안 정하면 내보낸 보고파일의 그 칸이 빈다.
            */}
            <div>
              <label className="mb-1 block text-sm text-slate-600">공급형태</label>
              <select className={inputCls} value={form.udiSupplyShape}
                      onChange={(e) => set('udiSupplyShape', e.target.value)}>
                <option value="">(미지정)</option>
                {['제조, 수입, 판매', '의료기관', '약국개설자, 의약품도매상', '견본품, 기부용, 군납용'].map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">주소2 우편번호</label>
              <input className={inputCls} value={form.postalCode2} onChange={(e) => set('postalCode2', e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm text-slate-600">주소2</label>
              <input className={inputCls} value={form.address2} onChange={(e) => set('address2', e.target.value)}
                     placeholder="배송지 등 주소1과 다른 곳" />
            </div>
            {/*
              원본 거래처검색 조건의 [검색창내용]. 공식 상호 말고 사람들이 실제로 부르는
              이름을 적어 두고 그걸로 찾는다 — 코드도움이 이 값도 같이 본다.
            */}
            <div className="sm:col-span-3">
              <label className="mb-1 block text-sm text-slate-600">검색창내용</label>
              <input className={inputCls} value={form.searchKeyword}
                     onChange={(e) => set('searchKeyword', e.target.value)}
                     placeholder="약칭·영문명·옛 상호 등 (코드도움에서 이 값으로도 찾습니다)" />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">홈페이지</label>
              <input className={inputCls} value={form.homepage} onChange={(e) => set('homepage', e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm text-slate-600">적요</label>
              <input className={inputCls} value={form.remark} onChange={(e) => set('remark', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">세무신고거래처</label>
              <select className={inputCls} value={form.taxReport ? 'Y' : 'N'}
                      onChange={(e) => setForm((f) => ({ ...f, taxReport: e.target.value === 'Y' }))}>
                <option value="Y">대상</option>
                <option value="N">제외</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">출하대상거래처</label>
              <select className={inputCls} value={form.shipmentTarget ? 'Y' : 'N'}
                      onChange={(e) => setForm((f) => ({ ...f, shipmentTarget: e.target.value === 'Y' }))}>
                <option value="Y">대상</option>
                <option value="N">제외</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">사용구분</label>
              <select className={inputCls} value={form.active ? 'Y' : 'N'}
                      onChange={(e) => setForm((f) => ({ ...f, active: e.target.value === 'Y' }))}>
                <option value="Y">사용</option>
                <option value="N">사용중단</option>
              </select>
            </div>
          </div>
          )}

          {formTab === '여신/단가' && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {/*
              단가그룹은 특별단가등록의 '그룹별' 이 보는 값이다. 엔티티와 API 에는 진작 있었는데
              폼에 칸이 없어 <b>PATCH /partners/{id}/price-group 을 직접 부르지 않으면 정할 수가 없었다.</b>
            */}
            <div>
              <label className="mb-1 block text-sm text-slate-600">판매단가그룹</label>
              <input className={inputCls} value={form.salesPriceGroup} onChange={(e) => set('salesPriceGroup', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">구매단가그룹</label>
              <input className={inputCls} value={form.purchasePriceGroup} onChange={(e) => set('purchasePriceGroup', e.target.value)} />
            </div>
            <div className="sm:col-span-3" style={{ fontSize: 11.5, color: '#8a929c' }}>
              ※ 여신한도는 원본 탭 안을 열어 보지 못해(탭을 누르기 전에는 화면에 없습니다) 만들지 않았습니다.
            </div>
          </div>
          )}

          {formTab === '부가정보' && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {/* 원본 리스트의 [이체정보] — 지급할 때 쓸 계좌. */}
            <div>
              <label className="mb-1 block text-sm text-slate-600">은행</label>
              <input className={inputCls} value={form.bankName} onChange={(e) => set('bankName', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">계좌번호</label>
              <input className={inputCls} value={form.accountNo} onChange={(e) => set('accountNo', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">예금주</label>
              <input className={inputCls} value={form.accountHolder} onChange={(e) => set('accountHolder', e.target.value)} />
            </div>
          </div>
          )}

          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
            <button type="submit" className="ec-btn ec-btn-primary">저장(F8)</button>
            {/*
              복사 — 원본 폼의 버튼이다. 값은 그대로 두고 코드만 비워 '새 거래처' 로 돌린다.
              거래처는 업태·종목·주소가 비슷한 것을 여럿 만드는 일이 잦다.
            */}
            {editId != null && (
              <button type="button" className="ec-btn" onClick={() => {
                setEditId(null)
                setForm((f) => ({ ...f, code: '', active: true }))
                setFormTab('기본')
              }}>복사</button>
            )}
            <button type="button" className="ec-btn" onClick={() => { setForm(empty); setFormTab('기본') }}>다시 작성</button>
            <button type="button" className="ec-btn" onClick={() => setShowForm(false)}>닫기</button>
          </div>
        </form>
      )}</Modal>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34, textAlign: 'center' }}>
                <input type="checkbox"
                       checked={shown.length > 0 && shown.every((x) => checked.has(x.id))}
                       onChange={() => setChecked(
                         shown.every((x) => checked.has(x.id)) ? new Set() : new Set(shown.map((x) => x.id)),
                       )} />
              </th>
              <th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('거래처코드')}>거래처코드 {sort.mark('거래처코드')}</th>
              <th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('거래처명')}>거래처명 {sort.mark('거래처명')}</th>
              <th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('구분')}>구분 {sort.mark('구분')}</th>
              <th>사업자번호</th>
              <th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('대표자명')}>대표자명 {sort.mark('대표자명')}</th>
              <th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('거래처그룹')}>거래처그룹 {sort.mark('거래처그룹')}</th>
              <th>담당자</th>
              <th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('전화')}>전화 {sort.mark('전화')}</th>
              <th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('모바일')}>모바일 {sort.mark('모바일')}</th>
              {/*
                원본 거래처리스트의 [검색창내용] 열. 품목에는 넣었는데 거래처에는 빠져 있었다 —
                별명을 적어 놓고도 목록에서는 그게 뭔지 볼 수가 없었다.
              */}
              <th style={{ cursor: 'pointer', width: 140 }}onClick={() => sort.toggle('검색창내용')}>검색창내용 {sort.mark('검색창내용')}</th>
              <th style={{ width: 90, textAlign: 'center' }}>사용구분</th>
              <th style={{ width: 90, textAlign: 'center' }}>이체정보</th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={14} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={14} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : (
              shown.map((p) => (
                <tr key={p.id} style={{ color: p.active ? undefined : '#9aa1ab' }}>
                  <td style={{ textAlign: 'center' }}>
                    <input type="checkbox" checked={checked.has(p.id)} onChange={() => setChecked((prev) => {
                      const next = new Set(prev)
                      if (next.has(p.id)) next.delete(p.id); else next.add(p.id)
                      return next
                    })} />
                  </td>
                  {/* 원본은 코드·이름을 눌러 그 건을 연다(사본 실측: 두 칸이 링크다). */}
                  <td style={{ fontFamily: 'monospace' }}>
                    <button type="button" onClick={() => openEdit(p)}
                            style={{ color: 'var(--ec-blue)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'monospace', fontSize: 12.5 }}>
                      {p.code}
                    </button>
                  </td>
                  <td>
                    <button type="button" onClick={() => openEdit(p)}
                            style={{ color: 'var(--ec-blue)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12.5, textAlign: 'left' }}>
                      {p.name}
                    </button>
                  </td>
                  <td><span style={{ background: typeColor(p.type).bg, color: typeColor(p.type).fg, padding: '1px 6px', borderRadius: 3, fontSize: 11.5, fontWeight: 600 }}>{p.typeName}</span></td>
                  <td>{p.bizRegNo ?? ''}</td>
                  <td>{p.ceoName ?? ''}</td>
                  <td>{p.partnerGroupName ?? ''}</td>
                  <td>{p.manager ?? ''}</td>
                  <td>{p.phone ?? ''}</td>
                  <td>{p.mobile ?? ''}</td>
                  <td style={{ color: '#6b7280' }}>{p.searchKeyword ?? ''}</td>
                  <td style={{ textAlign: 'center', color: p.active ? '#1c7c3c' : '#c60a2e' }}>
                    {p.active ? '사용' : '사용중단'}
                  </td>
                  {/* 원본은 계좌가 있으면 '등록', 없으면 빈칸이다. 계좌번호를 목록에 늘어놓지 않는다. */}
                  <td style={{ textAlign: 'center', color: p.accountNo ? 'var(--ec-blue)' : '#c9ced6' }}>
                    {p.accountNo ? '등록' : ''}
                  </td>
                  <td>
                    <button onClick={() => openEdit(p)} style={{ color: 'var(--ec-blue)', marginRight: 8, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>수정</button>
                    <button onClick={() => remove(p)} style={{ color: '#c60a2e', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>삭제</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/*
        원본 [변경] — 고른 거래처의 한 칸을 한 번에 바꾼다. 어떤 칸을 바꿀지 고르고
        새 값을 정한다. 비우면 그 칸을 비운다(담당자 없음 · 그룹 미지정).
      */}
      <Modal open={bulkOpen} title={`거래처 일괄변경 (${checked.size}건)`} onClose={() => setBulkOpen(false)}>{(
        <div style={{ padding: 4 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label className="mb-1 block text-sm text-slate-600">바꿀 항목</label>
              <select className={inputCls} value={bulkField} style={{ width: 180 }}
                      onChange={(e) => { setBulkField(e.target.value as 'manager' | 'partnerGroupId'); setBulkValue('') }}>
                <option value="manager">거래처관리담당자</option>
                <option value="partnerGroupId">거래처그룹1</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">새 값</label>
              {bulkField === 'manager' ? (
                <input className={inputCls} value={bulkValue} style={{ width: 220 }}
                       placeholder="거래처관리담당자"
                       onChange={(e) => setBulkValue(e.target.value)} />
              ) : (
                <select className={inputCls} value={bulkValue} style={{ width: 220 }}
                        onChange={(e) => setBulkValue(e.target.value)}>
                  <option value="">(미지정)</option>
                  {partnerGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              )}
            </div>
          </div>
          <p style={{ marginTop: 8, fontSize: 11.5, color: '#8a929c' }}>
            고른 거래처의 그 칸만 바꿉니다. 나머지 값은 그대로 둡니다.
          </p>
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
            <button type="button" className="ec-btn" onClick={() => setBulkOpen(false)}>닫기</button>
            <button type="button" className="ec-btn ec-btn-primary" onClick={bulkChange}>변경</button>
          </div>
        </div>
      )}</Modal>

      {groupOpen && (
        <GroupMasterModal
          title="거래처그룹" endpoint="/partner-groups"
          members={(() => {
            const m = new Map<string, string[]>()
            for (const p of partners) {
              const k = p.partnerGroupName ?? '(미지정)'
              if (!m.has(k)) m.set(k, [])
              m.get(k)!.push(`[${p.code}] ${p.name}`)
            }
            return m
          })()}
          onClose={() => setGroupOpen(false)} onChanged={load}
        />
      )}

      {webOpen && (
        <div onClick={() => setWebOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 4, width: 520, maxWidth: '92vw', boxShadow: '0 10px 30px rgba(0,0,0,.2)' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #e6eaef', fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center' }}>
              <span>웹자료올리기 · 거래처 대량 등록</span>
              <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={() => setWebOpen(false)}>닫기</button>
            </div>
            <div style={{ padding: 14, fontSize: 12.5, lineHeight: 1.7, color: '#3c4553' }}>
              <p style={{ margin: '0 0 8px' }}>엑셀/CSV 파일로 거래처를 한 번에 등록하는 기능입니다. 파일을 고르면 형식을 미리 확인할 수 있습니다.</p>
              {/* 원본 [웹자료올리기] 도 끌어다 놓을 수 있다. 파일 선택 버튼은 그대로 둔다. */}
              <EcFileDrop
                hint="여기에 파일 놓기 (엑셀·CSV)"
                onFiles={(fs) => onPickFile({ target: { files: fs } } as unknown as React.ChangeEvent<HTMLInputElement>)}
              />
              {webFile && (
                <div style={{ marginTop: 10, border: '1px solid #e6eaef', borderRadius: 3, padding: 10, background: '#f9fbfd' }}>
                  <div><b>{webFile.name}</b> · 데이터 <b style={{ color: 'var(--ec-blue-dark)' }}>{webFile.total.toLocaleString()}</b>행 인식</div>
                  {webFile.head.length > 0 && <div style={{ marginTop: 4, color: '#5a626e' }}>헤더: {webFile.head.join(' · ')}</div>}
                </div>
              )}
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <button className="ec-btn" disabled title="서버 업로드 API 미구현" style={{ opacity: .55, cursor: 'default' }}>업로드 실행 (백엔드 미연동)</button>
                <span style={{ fontSize: 11.5, color: '#c07a00' }}>* 서버 일괄등록 API가 없어 미리보기까지만 제공합니다.</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </EcListShell>
  )
}
