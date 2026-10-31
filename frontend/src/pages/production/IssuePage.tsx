import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import CodePickerField from '../../components/codepicker/CodePickerField'
import { EcCond } from '../../components/EcStatusPanel'
import { useCondPickers } from '../../utils/useCondPickers'
import { api, extractErrorMessage } from '../../api/client'
import { printDocuments } from '../../utils/printDocument'
import EcListShell from '../../components/EcListShell'
import { dateText } from '../../utils/dateText'
import EcPeriodPicks, { INQUIRY_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { useItemMgmt } from '../../utils/itemMgmtItems'
import { ecAlert, ecConfirm } from '../../components/EcDialog'
import { EcDateRange } from '../../components/ui/EcDateInput'

/** 생산관리 > 생산불출 — 자재 불출 등록/삭제 (백엔드 /api/material-issues 연동) */
/** 원본 탭 [전체 · 결재중 · 미확인 · 확인] — 진행상태. */
const CONF_TABS = ['전체', '결재중', '미확인', '확인'] as const
const CONF_OF: Record<string, string> = { 결재중: 'IN_APPROVAL', 미확인: 'UNCONFIRMED', 확인: 'CONFIRMED' }

interface MaterialIssue {
  /** 원본 [최초작성자] — 넣은 계정(2026-10-02 전에 넣은 불출은 비어 있다). */
  createdBy?: string | null
  /** 진행상태 — 결재중·미확인·확인. */
  confirmStatus?: 'UNCONFIRMED' | 'IN_APPROVAL' | 'CONFIRMED'
  id: number
  itemId: number
  /** 불출 전표번호. 원본 [일자-No.] 의 뒷부분이다. */
  issueNo: string
  itemCode: string
  itemName: string
  itemSpec: string | null
  unit: string
  warehouseId: number | null
  warehouseName: string | null
  toWarehouseId: number | null
  toWarehouseName: string | null
  workOrderId: number | null
  workOrderNo: string | null
  /** 그 작업지시를 낸 날. 원본 [불러온 전표일자] — 우리가 불러오는 전표는 작업지시서뿐이다. */
  workOrderDate: string | null
  /**
   * 작업지시가 가리키는 생산품목. 원본 생산불출입력 머리의 [생산품목] 이고
   * 그리드의 [작업지시품목코드] 이기도 하다. 작업지시 없이 낸 불출이면 null.
   */
  productCode: string | null
  productName: string | null
  /**
   * 담당자(사원) id. <b>이름은 여기 없다</b> — production 은 hr 을 참조할 수 없어
   * 서버가 붙이지 못한다(hr → accounting → production 이 이미 있어 순환).
   */
  employeeId: number | null
  qty: number
  issueDate: string
  note: string | null
  /** 원본 조건 [품목구분]. 품목 마스터의 값이라 서버가 실어 준다. */
  itemCategoryName: string | null
  /** 원본 머리의 [프로젝트]. <b>응답에 진작 오는데</b> 이 화면이 안 받아 두고 있었다. */
  projectId: number | null
  projectName: string | null
  /** 원본 조건 [최초작성일자]·[최종작업일자], [기타]의 수정일자순(정렬). */
  createdAt: string | null
  updatedAt: string | null
}
interface EmployeeLite { id: number; code: string; name: string }

/*
 * 원본 생산불출조회는 <b>[최근30일(+1개월)]</b> 로 열린다(사본 실측 — 달 스핀박스가
 * 06·08 셋). 불출은 <b>앞으로 낼 것</b>까지 잡아 두는 일이 있어 미래가 들어간다.
 *
 * <p>우리는 기간 칸이 <b>아예 없었다</b>.
 */
const initP = periodOf('최근30일(+1개월)')!

export default function IssuePage() {
  const [rows, setRows] = useState<MaterialIssue[]>([])
  /** 원본은 일자와 번호를 '2026/08/29 -1' 로 한 칸에 적는다(판매조회·견적서와 같은 규칙). */
  const dateNo = (r: { issueDate: string; issueNo: string }) => {
    const seq = r.issueNo.split('-').pop() ?? ''
    return `${r.issueDate.replace(/-/g, '/')} -${Number(seq) || seq}`
  }
  /** 담당자 이름은 서버가 못 붙여서 화면이 붙인다. */
  const [employees, setEmployees] = useState<EmployeeLite[]>([])
  /**
   * 원본은 목록 첫 칸에서 줄을 골라 [선택삭제] 한다(사본 실측: CHK_H 열).
   * 우리는 줄마다 [삭제]뿐이라, 잘못 넣은 열 건을 지우려면 열 번 눌러 열 번 확인해야 했다.
   */
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [confTab, setConfTab] = useState<(typeof CONF_TABS)[number]>('전체')
  const [statusPick, setStatusPick] = useState(false)
  /** 원본 [진행상태변경] — 고른 줄의 불출 전표를 미확인 ↔ 확인. 확인한 전표는 확인취소를 먼저 해야 지울 수 있다. */
  async function changeStatus(status: 'CONFIRMED' | 'UNCONFIRMED') {
    const nos = [...new Set(rows.filter((x) => checked.has(x.id)).map((x) => x.issueNo))]
    if (nos.length === 0) { setError('바꿀 줄을 고르세요.'); return }
    try {
      await api.post('/material-issues/slips/status', { issueNos: nos, status })
      setChecked(new Set()); setStatusPick(false); setError('')
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [from, setFrom] = useState(initP.from)
  const [to, setTo] = useState(initP.to)
  const [whCond, setWhCond] = useState('')
  const [itemCond, setItemCond] = useState('')
  const [empCond, setEmpCond] = useState('')
  const [noteCond, setNoteCond] = useState('')
  const [fromWhCond, setFromWhCond] = useState('')
  const [toWhCond, setToWhCond] = useState('')
  const [categoryCond, setCategoryCond] = useState('')
  const [itemGroupCond, setItemGroupCond] = useState('')
  const [projectCond, setProjectCond] = useState('')
  const [authorCond, setAuthorCond] = useState('')
  const [madeFrom, setMadeFrom] = useState('')
  const [madeTo, setMadeTo] = useState('')
  const [editedFrom, setEditedFrom] = useState('')
  const [editedTo, setEditedTo] = useState('')
  /** 원본 [기타] — 이 화면에서는 <b>수정일자순(정렬)</b> 하나다(실측). */
  const [byUpdated, setByUpdated] = useState(false)
  /** 원본 [품목그룹1]. 품목 마스터에 붙는 값이라 마스터를 받아 itemId 로 잇는다. */
  const mgmt = useItemMgmt()
  const condPickers = useCondPickers(['warehouses', 'items', 'employees'])
  /*
   * 생산불출입력은 따로 있는 화면이다(/production/issue-entry — 원본 E040404 실측). [신규(F2)] 와 옛 주소 ?new=1 은 그리로 보낸다.
   */
  const navigate = useNavigate()
  const [params] = useSearchParams()
  useEffect(() => { if (params.get('new') === '1') navigate('/production/issue-entry', { replace: true }) }, [params, navigate])

  async function load() {
    setLoading(true)
    try {
      /*
       * <b>고른 기간을 서버에도 보낸다.</b> 여태 불출을 통째로 받아 아래에서
       * <code>r.issueDate &gt;= from</code> 으로 걸렀다.
       */
      const period: Record<string, string> = {}
      if (from) period.from = from
      if (to) period.to = to
      const res = await api.get<MaterialIssue[]>('/material-issues', { params: period })
      setRows(res.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  async function loadRefs() {
    try {
      /* 입력은 생산불출입력 화면이 맡는다 — 목록은 담당자 이름만 붙인다. */
      const emp = await api.get<EmployeeLite[]>('/sales-reps')
      setEmployees(emp.data)
    } catch {
      /* 담당자 이름만 '-' 로 남는다 */
    }
  }

  /* 기간을 바꾸면 그 기간으로 다시 받는다(참조 자료는 기간과 상관없다). */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [from, to])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadRefs() }, [])

  /** 담당자 이름. 서버가 못 붙여서 화면이 붙인다 — 지워진 사원이면 '-'. */
  const empName = (id: number | null) =>
    id == null ? '-' : (employees.find((x) => x.id === id)?.name ?? '-')


  /**
   * 원본 생산불출조회 격자의 마지막 열 <b>[인쇄]</b> — 그 한 건을 불출증으로 찍는다.
   *
   * <p>금액 칸은 안 그린다. 불출은 사내 이동이라 금액이 없다 — 0 으로 채워 그리면
   * "0원짜리 거래" 로 읽힌다. 공급자/공급받는자 칸도 없다(거래 상대가 없다).
   */
  async function printOne(r: MaterialIssue) {
    await printDocuments([{
      title: '생산불출증',
      /*
       * 이제 불출에도 전표번호가 있다. 예전에는 <b>작업지시번호를 대신 찍었다</b> —
       * 종이만 보면 어느 불출을 찍은 것인지 알 수 없었고, 지시 하나에 불출이 여럿이면
       * 같은 번호의 종이가 여러 장 나왔다.
       */
      docNo: r.issueNo,
      docDate: r.issueDate,
      hideAmounts: true,
      hideParties: true,
      supplier: { label: '', name: '' },
      customer: { label: '', name: '' },
      extra: [
        { label: '보내는창고', value: r.warehouseName },
        { label: '받는공장', value: r.toWarehouseName },
        { label: '담당자', value: r.employeeId ? empName(r.employeeId) : null },
        { label: '생산품목', value: r.productName },
      ],
      remark: r.note,
      lines: [{
        itemCode: r.itemCode, itemName: r.itemName, unit: r.unit,
        quantity: r.qty, unitPrice: 0, supplyAmount: 0, vatAmount: 0,
      }],
    }])
  }

  async function remove(r: MaterialIssue) {
    if (!(await ecConfirm(`'${r.itemName}' 불출내역을 삭제할까요?`))) return
    try {
      await api.delete(`/material-issues/${r.id}`)
      load()
    } catch (err) {
      void ecAlert(extractErrorMessage(err))
    }
  }

  /** 원본 [선택삭제]. 지우면 옮겼던 재고도 서버가 되돌린다(줄마다 [삭제]와 같은 길). */
  async function removeChecked() {
    const targets = shown.filter((r) => checked.has(r.id))
    if (targets.length === 0) { setError('지울 불출내역을 고르세요.'); return }
    if (!(await ecConfirm(`고른 ${targets.length}건을 삭제할까요? 옮겼던 재고도 되돌아갑니다.`))) return
    setError('')
    const results = await Promise.allSettled(targets.map((r) => api.delete(`/material-issues/${r.id}`)))
    const failed = results.filter((x) => x.status === 'rejected').length
    setChecked(new Set())
    await load()
    if (failed > 0) setError(`${targets.length - failed}건 삭제, ${failed}건 실패.`)
  }

  /*
   * 2026-09-08 에 원본(생산불출조회)을 열어 조건을 <b>전부</b> 쟀다 — <b>스물아홉</b>이다.
   * 사본에는 다섯뿐이었다(일곱 번째 같은 구멍). 기본 기간도 [최근30일(+1개월)] 이다.
   *
   * <p>여기 적혀 있던 '[프로젝트]는 생산불출 응답에 그 값이 없어 못 만든다' 는 <b>틀렸다</b> —
   * MaterialIssueResponse 가 <code>projectId·projectName</code> 을 진작 싣고 있고
   * 이 화면이 받아 두지 않았을 뿐이다.
   *
   * <p>원본이 [창고]와 [보내는창고]·[받는창고]를 나란히 두는 까닭은 창고이동조회와 같다 —
   * [창고]는 어느 쪽이든 걸리고 나머지 둘은 한쪽만 건다.
   */
  const shown = rows
    .filter((r) => confTab === '전체' || CONF_OF[confTab] === r.confirmStatus)
    .filter((r) => (!from || r.issueDate >= from) && (!to || r.issueDate <= to))
    .filter((r) => !keyword || r.itemName.includes(keyword) || (r.workOrderNo ?? '').includes(keyword))
    .filter((r) => !whCond || String(r.warehouseId) === whCond || String(r.toWarehouseId) === whCond)
    .filter((r) => !itemCond || String(r.itemId) === itemCond)
    /* [보내는창고]·[받는창고] — 위 [창고]와 달리 한쪽만 본다. */
    .filter((r) => !fromWhCond || String(r.warehouseId) === fromWhCond)
    .filter((r) => !toWhCond || String(r.toWarehouseId) === toWhCond)
    .filter((r) => !categoryCond || (r.itemCategoryName ?? '') === categoryCond)
    .filter((r) => !itemGroupCond || mgmt.groupOf(r.itemId) === itemGroupCond)
    .filter((r) => !projectCond || (r.projectName ?? '') === projectCond)
    .filter((r) => !authorCond || (r.createdBy ?? '') === authorCond)
    .filter((r) => !madeFrom || (r.createdAt ?? '').slice(0, 10) >= madeFrom)
    .filter((r) => !madeTo || ((r.createdAt ?? '') !== '' && r.createdAt!.slice(0, 10) <= madeTo))
    .filter((r) => !editedFrom || (r.updatedAt ?? '').slice(0, 10) >= editedFrom)
    .filter((r) => !editedTo || ((r.updatedAt ?? '') !== '' && r.updatedAt!.slice(0, 10) <= editedTo))
    .filter((r) => !empCond || empName(r.employeeId).includes(empCond))
    .filter((r) => !noteCond || (r.note ?? '').includes(noteCond))
    /* 원본 [기타]의 수정일자순(정렬) — 켜면 마지막에 고친 불출이 위로 온다. */
    .sort((a, b) => (byUpdated ? (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '') : 0))

  return (
    <EcListShell
      title="생산불출조회"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      onNew={() => navigate('/production/issue-entry')}
      actions={[{ label: '검색(F8)', onClick: load },
                { label: '진행상태변경', onClick: () => setStatusPick((v) => !v), selected: checked.size },
                { label: '인쇄' },
                { label: `선택삭제${checked.size ? ` (${checked.size})` : ''}`, onClick: removeChecked },
                { label: 'Excel' }]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {statusPick && (
        <div className="flex items-center gap-[6px] mb-[8px] py-[6px] px-[8px] border border-ec-line border-solid bg-white">
          <span className="text-[12.5px]">고른 {checked.size}줄의 전표를</span>
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => void changeStatus('CONFIRMED')}>확인</button>
          <button type="button" className="ec-btn" onClick={() => void changeStatus('UNCONFIRMED')}>확인취소</button>
          <button type="button" className="ec-btn" onClick={() => setStatusPick(false)}>취소</button>
        </div>
      )}
      <div className="ec-pills" style={{ marginBottom: 8 }}>
        {CONF_TABS.map((t) => (
          <button key={t} type="button" className={`ec-pill no-ec${confTab === t ? ' active' : ''}`} onClick={() => setConfTab(t)}>{t}</button>
        ))}
      </div>


      {/* 원본 조건 차례: 창고 · 품목 · 프로젝트 · 담당자 · 적요 */}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        {/* 원본 조건 첫째 <b>[기준일자]</b>(사본 실측). */}
        <EcCond label="기준일자">
          <EcDateRange from={{ className: "ec-input", value: from, onChange: (e) => setFrom(e.target.value) }} to={{ className: "ec-input", value: to, onChange: (e) => setTo(e.target.value) }} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={INQUIRY_PICKS} currentFrom={from}
              onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={170} emptyLabel="전체"
                           value={whCond} onChange={setWhCond} items={condPickers.warehouses} />
        </EcCond>
        {/* 원본 차례: 창고 · (창고계층그룹) · 보내는창고 · 받는창고 · 품목 · 품목구분 · 품목그룹1 · 프로젝트 · 담당자 · 적요 … */}
        <EcCond label="보내는창고" pick>
          <CodePickerField label="보내는창고" hideLabel width={170} emptyLabel="전체"
                           value={fromWhCond} onChange={setFromWhCond} items={condPickers.warehouses} />
        </EcCond>
        <EcCond label="받는창고" pick>
          <CodePickerField label="받는창고" hideLabel width={170} emptyLabel="전체"
                           value={toWhCond} onChange={setToWhCond} items={condPickers.warehouses} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={170} emptyLabel="전체"
                           value={itemCond} onChange={setItemCond} items={condPickers.items} />
        </EcCond>
        <EcCond label="품목구분" pick>
          <CodePickerField label="품목구분" hideLabel width={150} emptyLabel="전체"
                           value={categoryCond} onChange={setCategoryCond}
                           items={[...new Set(rows.map((r) => r.itemCategoryName).filter(Boolean) as string[])].sort()
                             .map((n) => ({ value: n, name: n }))} />
        </EcCond>
        <EcCond label="품목그룹1" pick>
          <CodePickerField label="품목그룹1" hideLabel width={150} emptyLabel="전체"
                           value={itemGroupCond} onChange={setItemGroupCond}
                           items={mgmt.groupOptions.map((n) => ({ value: n, name: n }))} />
        </EcCond>
        {/* 여기 '응답에 그 값이 없어 못 만든다' 고 적혀 있었으나 진작 오고 있었다. */}
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={170} emptyLabel="전체"
                           value={projectCond} onChange={setProjectCond}
                           items={[...new Set(rows.map((r) => r.projectName).filter(Boolean) as string[])].sort()
                             .map((n) => ({ value: n, name: n }))} />
        </EcCond>
        <EcCond label="담당자" pick>
          <CodePickerField label="담당자" hideLabel width={170} emptyLabel="전체"
                           value={empCond} onChange={setEmpCond} items={condPickers.employees} />
        </EcCond>
        <EcCond label="적요">
          <input className="ec-input" value={noteCond}
                 onChange={(e) => setNoteCond(e.target.value)} style={{ width: 170 }} />
        </EcCond>
        {/* 원본 차례: 적요 · (최종수정자 · 발송여부 · 오더관리번호) · 최초작성자 · 최초작성일자 · 최종작업일자 · (입력경로 · 삭제구분) · 기타 */}
        <EcCond label="최초작성자" pick>
          <CodePickerField label="최초작성자" hideLabel width={150} emptyLabel="전체"
                           value={authorCond} onChange={setAuthorCond}
                           items={[...new Set(rows.map((r) => r.createdBy).filter(Boolean) as string[])].sort()
                             .map((n) => ({ value: n, name: n }))} />
        </EcCond>
        <EcCond label="최초작성일자">
          <EcDateRange from={{ className: "ec-input", value: madeFrom, onChange: (e) => setMadeFrom(e.target.value) }} to={{ className: "ec-input", value: madeTo, onChange: (e) => setMadeTo(e.target.value) }} />
        </EcCond>
        <EcCond label="최종작업일자">
          <EcDateRange from={{ className: "ec-input", value: editedFrom, onChange: (e) => setEditedFrom(e.target.value) }} to={{ className: "ec-input", value: editedTo, onChange: (e) => setEditedTo(e.target.value) }} />
        </EcCond>
        <EcCond label="기타">
          <label className="text-[12.5px] flex items-center gap-[4px]">
            <input type="checkbox" checked={byUpdated} onChange={(e) => setByUpdated(e.target.checked)} />
            수정일자순(정렬)
          </label>
        </EcCond>
      </ul>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px] text-center">
              <input type="checkbox"
                     checked={shown.length > 0 && shown.every((r) => checked.has(r.id))}
                     onChange={() => setChecked(
                       shown.every((r) => checked.has(r.id)) ? new Set() : new Set(shown.map((r) => r.id)),
                     )} />
            </th>
            {/*
              원본 첫 열은 [일자]가 아니라 <b>[일자-No.]</b> 다(사본 실측). 날짜만 있으면
              같은 날 여러 건을 가리킬 말이 없다 — 이번에 불출에도 전표번호를 달았다.
              적는 규칙은 판매조회·견적서와 같다('2026/08/29 -1').
            */}
            <th>일자-No.</th>
            <th className="w-[90px]">담당자</th>
            {/*
              원본 차례: 일자-No. · <b>보내는창고명 · 받는공장명</b> · 품목명[규격명] ·
              수량 · <b>작업지시서</b> · 인쇄. 어디서 어디로 갔는지가 먼저고,
              어느 지시 때문인지는 뒤따라 읽는다. 우리는 그 셋이 다 딴 자리에 있었다.
            */}
            <th>보내는창고명</th>
            <th>받는공장명</th>
            {/*
              원본 이름은 [작업지시품목코드]다. 우리는 [생산품목]이라 적고 '[코드] 이름'
              을 한 칸에 몰아 두었다 — 원본을 쓰던 사람이 코드로 훑을 때 눈이 걸린다.
              이름은 잃지 않게 칸의 tooltip 으로 남긴다.
            */}
            {/*
              원본 폭 실측: [품목코드] 125 · [작업지시품목코드] 70 — <b>작업지시 쪽이 좁다.</b>
              불출의 주인공은 빠져 나가는 자재(품목코드)고, 작업지시 품목은 어디에 쓰였는지
              가리키는 곁가지라서다. 우리는 130 vs 120 으로 <b>반대</b>였다.
            */}
            {/*
              원본 [불러온 전표일자] — 언제 낸 지시를 보고 불출했는지는 번호만으로는 모른다.
              [작업지시서]가 원본의 [불러온 전표No.] 자리이기도 하다(우리가
              불러오는 전표는 작업지시서뿐이다).
              원본 차례상 <b>[작업지시품목코드]보다 앞</b>이다.
            */}
            <th className="w-[100px]">불러온 전표일자</th>
            <th className="w-[70px]">작업지시품목코드</th>
            <th className="w-[125px]">품목코드</th>
            {/* 원본 열 이름은 [품목명[규격명]] — 이름만으로는 같은 이름의 다른 규격을 못 가린다. */}
            <th>품목명[규격명]</th>
            <th className="text-right">수량</th>
            <th>단위</th>
            <th>작업지시서</th>
            <th>적요</th>
            {/* 원본 생산불출조회의 마지막 열 [인쇄] — 그 한 건을 불출증으로 찍는다. */}
            <th className="w-[60px] text-center">인쇄</th>
            <th className="w-[60px] text-center">관리</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={15} className="ec-empty">불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={15} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r) => (
            <tr key={r.id}>
              <td className="text-center">
                <input type="checkbox" checked={checked.has(r.id)} onChange={() => setChecked((prev) => {
                  const next = new Set(prev)
                  if (next.has(r.id)) next.delete(r.id); else next.add(r.id)
                  return next
                })} />
              </td>
              <td>{dateNo(r)}</td>
              <td style={{ color: r.employeeId ? undefined : 'var(--ec-text-off)' }}>{empName(r.employeeId)}</td>
              <td>{r.warehouseName ?? ''}</td>
              <td style={{ color: r.toWarehouseName ? undefined : 'var(--ec-text-off)' }}>{r.toWarehouseName ?? ''}</td>
              <td style={{ fontFamily: 'monospace', color: r.workOrderDate ? 'var(--ec-label)' : 'var(--ec-text-off)' }}>{dateText(r.workOrderDate) || ''}</td>
              <td style={{ fontFamily: 'monospace', color: r.productCode ? undefined : 'var(--ec-text-off)' }}
                  title={r.productName ?? ''}>
                {r.productCode ?? '-'}
              </td>
              <td>{r.itemCode}</td>
              <td>{r.itemName}{r.itemSpec ? `[${r.itemSpec}]` : ''}</td>
              <td className="text-right">{r.qty.toLocaleString()}</td>
              <td>{r.unit}</td>
              <td>{r.workOrderNo ?? ''}</td>
              <td>{r.note ?? ''}</td>
              <td className="text-center">
                <button onClick={() => printOne(r)} style={{ color: 'var(--ec-blue)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>인쇄</button>
              </td>
              <td className="text-center">
                <button onClick={() => remove(r)} style={{ color: 'var(--ec-danger)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>삭제</button>
              </td>
            </tr>
          ))}
        </tbody>
        {shown.length > 0 && (
          <tfoot>
            <tr>
              {/* 수량은 열째 칸이다(체크 · 일자-No. · 담당자 · 보내는 · 받는 · 불러온일자 · 작업지시품목코드 · 품목코드 · 품목명 = 9). */}
              <td colSpan={9} className="text-right font-bold">합계</td>
              <td className="text-right font-bold">
                {shown.reduce((a, r) => a + r.qty, 0).toLocaleString()}
              </td>
              <td colSpan={5}></td>
            </tr>
          </tfoot>
        )}
      </table>
    </EcListShell>
  )
}
