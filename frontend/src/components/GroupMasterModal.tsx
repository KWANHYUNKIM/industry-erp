import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../api/client'
import type { GroupMaster } from '../api/types'

/**
 * 계층그룹 모달 — 품목그룹·거래처그룹 마스터를 만들고 소속을 확인한다.
 *
 * <p>원본(이카운트)에서도 그룹은 별도 메뉴가 아니라 <b>목록 화면의 [계층그룹] 버튼</b>에서 다룬다.
 * 그래서 메뉴를 새로 만들지 않고 품목등록·거래처등록 두 화면이 이 모달을 공유한다.
 *
 * <p>그룹 마스터(`item_groups`/`partner_groups`)는 오래전부터 있었는데 등록 요청 DTO 에만
 * 그룹 id 가 빠져 있어 아무도 그룹을 지정할 수 없었다. 그래서 채권/채무현황의 그룹 소계는
 * 늘 '(미지정)' 한 줄이었다. 지정 경로가 생겼으니 만드는 경로도 함께 연다.
 *
 * <p><b>아직 계층이 아니다 — 이름과 달리 지금 이 그룹은 평면이다.</b>
 * `ItemGroup`·`PartnerGroup` 에 부모 자리가 없어 트리를 만들 수 없다.
 *
 * <p>원본은 진짜로 계층이다. 사본에서 <b>켜진 채로 열리는 조건 중 1위</b>가
 * [하위그룹포함검색]이고(396회, 2위 [전체] 347회보다 많다), 그 조건은 계층이 있어야
 * 뜻이 있다 — 상위 그룹으로 걸러도 그 아래 그룹의 품목·거래처까지 함께 나온다는 말이다.
 *
 * <p>여기서 시작하지 않은 까닭을 적어 둔다. 계층은 부모 컬럼 하나로 끝나지 않는다.
 * 거르는 자리마다 <b>"이 그룹 아래 것도 다 포함"</b> 을 뜻하게 고쳐야 하고, 화면에는
 * [하위그룹포함검색] 체크가 붙어야 하고, 그룹 마스터에는 트리를 만들고 순환을 막는
 * 일이 따로 든다. 부모 컬럼만 먼저 넣으면 <b>아무 화면도 존중하지 않는 트리</b>가 생긴다.
 *
 * <p>지금 그룹으로 거르는 자리는 채권·채무현황 하나다(거래처그룹). 원본은 그 화면
 * (거래처관리대장 II)에 [거래처그룹1]·[거래처그룹2]·[거래처계층그룹] 셋을 두는데,
 * 우리는 그룹이 하나뿐이고 평면이라 앞의 하나만 있다 — 나머지 둘은 ui-check 의
 * 조건 예외에 까닭과 함께 적혀 있다(창고등록의 [창고계층그룹]도 같다).
 */
export default function GroupMasterModal({
  title, endpoint, members, onClose, onChanged,
}: {
  title: string
  /** '/item-groups' 또는 '/partner-groups' */
  endpoint: string
  /** 그룹명 → 소속 목록 라벨. 그룹을 안 준 것은 '(미지정)' 키로 넘긴다. */
  members: Map<string, string[]>
  onClose: () => void
  /** 그룹을 만들거나 지운 뒤 호출 — 부모가 목록을 다시 읽는다. */
  onChanged: () => void
}) {
  const [groups, setGroups] = useState<GroupMaster[]>([])
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  async function load() {
    try {
      const r = await api.get<GroupMaster[]>(endpoint)
      setGroups(r.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }
  useEffect(() => { load() }, [endpoint])

  async function add() {
    setError('')
    if (!code.trim() || !name.trim()) return setError('그룹코드와 그룹명을 입력하세요.')
    try {
      await api.post(endpoint, { code: code.trim(), name: name.trim(), sortOrder: groups.length })
      setCode(''); setName('')
      await load()
      onChanged()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  async function remove(g: GroupMaster) {
    setError('')
    // 소속이 남아 있으면 서버가 막는다. 미리 알려 주는 편이 낫다.
    if ((members.get(g.name) ?? []).length > 0) {
      return setError(`'${g.name}' 에 소속이 ${members.get(g.name)!.length}건 있어 삭제할 수 없습니다.`)
    }
    try {
      await api.delete(`${endpoint}/${g.id}`)
      await load()
      onChanged()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  const unassigned = members.get('(미지정)') ?? []

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 4, width: 620, maxWidth: '92vw', maxHeight: '84vh', overflow: 'auto', boxShadow: '0 10px 30px rgba(0,0,0,.2)' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid #e6eaef', fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center' }}>
          <span>계층그룹 · {title}</span>
          <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={onClose}>닫기</button>
        </div>
        <div style={{ padding: 14, fontSize: 12.5, color: '#3c4553' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10 }}>
            <input className="ec-input" placeholder="그룹코드" value={code} onChange={(e) => setCode(e.target.value)} style={{ width: 110 }} />
            <input className="ec-input" placeholder="그룹명" value={name} onChange={(e) => setName(e.target.value)} style={{ width: 180 }} />
            <button className="ec-btn ec-btn-primary" onClick={add}>그룹 추가</button>
          </div>
          {error && <p style={{ margin: '0 0 8px', color: '#c60a2e' }}>{error}</p>}
          {groups.length === 0 && <p style={{ color: '#8a929c' }}>등록된 그룹이 없습니다. 위에서 하나 만들어 보세요.</p>}
          {groups.map((g) => {
            const list = members.get(g.name) ?? []
            return (
              <div key={g.id} style={{ marginBottom: 10, border: '1px solid #e6eaef', borderRadius: 3 }}>
                <div style={{ padding: '6px 10px', background: '#f5f8ff', fontWeight: 700, color: 'var(--ec-blue-dark)', display: 'flex', alignItems: 'center' }}>
                  <span>[{g.code}] {g.name} <span style={{ color: '#8a929c', fontWeight: 400 }}>({list.length})</span></span>
                  <button onClick={() => remove(g)} style={{ marginLeft: 'auto', color: '#c60a2e', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>삭제</button>
                </div>
                <div style={{ padding: '6px 10px', lineHeight: 1.8 }}>
                  {list.length === 0
                    ? <span style={{ color: '#9aa1ab' }}>소속 없음</span>
                    : list.map((label, i) => <span key={i} style={{ display: 'inline-block', marginRight: 10 }}>{label}</span>)}
                </div>
              </div>
            )
          })}
          {unassigned.length > 0 && (
            <div style={{ border: '1px dashed #d7dce3', borderRadius: 3 }}>
              <div style={{ padding: '6px 10px', background: '#fafbfc', fontWeight: 700, color: '#5a626e' }}>(미지정) <span style={{ color: '#8a929c', fontWeight: 400 }}>({unassigned.length})</span></div>
              <div style={{ padding: '6px 10px', lineHeight: 1.8 }}>
                {unassigned.slice(0, 60).map((label, i) => <span key={i} style={{ display: 'inline-block', marginRight: 10 }}>{label}</span>)}
                {unassigned.length > 60 && <span style={{ color: '#8a929c' }}>… 외 {unassigned.length - 60}건</span>}
              </div>
            </div>
          )}
          <p style={{ margin: '8px 0 0', fontSize: 11.5, color: '#8a929c' }}>* 소속 지정은 등록/수정 화면의 [{title}]에서 합니다.</p>
        </div>
      </div>
    </div>
  )
}
