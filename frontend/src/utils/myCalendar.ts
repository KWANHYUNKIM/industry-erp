/**
 * 일정관리 <b>[내 캘린더]</b> — 이 일정이 내 것인가.
 *
 * <p>원본 일정관리 왼쪽에는 내 캘린더 · [기본] 공유일정캘린더 · 다른 캘린더가 있다.
 * 우리는 그 자리가 없어 온 회사의 일정이 늘 한 줄로 섞여 나왔다.
 *
 * <p>규칙을 따로 뺀 이유는 <b>여기가 조용히 좁아지기 쉽기 때문</b>이다.
 * 만든 사람만 보면 <b>남이 잡아 준 회의</b>가 내 캘린더에서 사라진다 — 그게 제일 놓치기
 * 쉬운 일정인데, 화면은 그냥 목록이 짧아 보일 뿐이라 아무도 빠졌다고 생각하지 않는다.
 */

export interface CalendarRow {
  createdBy: string | null
  owner: string | null
  attendees: string | null
}

export interface Me {
  /** 표시 이름. 일정의 담당·참석자에는 보통 이 이름이 적힌다. */
  name?: string | null
  /** 로그인 아이디. 만든 사람에는 이 값이 남는다. */
  username?: string | null
}

/**
 * 만든 사람 · 담당 · 참석자 중 하나라도 나면 내 일정이다.
 *
 * <p>이름과 아이디를 <b>둘 다</b> 본다. 만든 사람에는 아이디가, 담당·참석자에는 이름이
 * 적히기 때문이다. 한쪽만 보면 그 칸에 적힌 일정을 통째로 놓친다.
 *
 * <p>누구인지 모르면(로그인 정보가 비었으면) <b>아무것도 내 것이 아니다.</b>
 * 빈 문자열로 훑으면 모든 줄이 걸려 '내 캘린더' 가 전체와 같아진다.
 */
export function isMyEvent(row: CalendarRow, me: Me): boolean {
  const name = (me.name ?? '').trim()
  const id = (me.username ?? '').trim()
  if (!name && !id) return false

  const hit = (v: string | null) => {
    if (!v) return false
    return (!!name && v.includes(name)) || (!!id && v.includes(id))
  }
  return hit(row.createdBy) || hit(row.owner) || hit(row.attendees)
}
