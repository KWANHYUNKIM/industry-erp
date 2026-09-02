/**
 * 첨부 자리에 <b>여러 개를 떨어뜨렸을 때</b> 무엇을 올릴지.
 *
 * <p>원본은 첨부가 있는 화면마다 [여기에 파일 놓기]가 있다. 끌어다 놓기는 파일을 한 번에
 * 여러 개 던질 수 있는데, 자리는 한 개만 받는 곳이 있다(기안서 첨부·증빙).
 *
 * <p>이 규칙을 따로 뺀 이유: <b>말없이 첫 개만 올리면 사람은 다섯을 놓고 다섯이 올라간 줄
 * 안다.</b> 화면에는 아무 오류도 안 뜬다 — 그게 제일 나쁜 실패다.
 * 그래서 몇 개를 빼고 올렸는지 함께 돌려준다.
 */

export interface DropPlan<T> {
  /** 실제로 올릴 것 */
  accepted: T[]
  /** 받지 않은 개수. 0 이면 알릴 것이 없다. */
  skipped: number
}

/**
 * @param files 떨어뜨린(또는 고른) 파일들
 * @param multiple 이 자리가 여러 개를 받는가
 */
export function planDrop<T>(files: T[], multiple: boolean): DropPlan<T> {
  if (files.length === 0) return { accepted: [], skipped: 0 }
  if (multiple) return { accepted: files, skipped: 0 }
  return { accepted: [files[0]], skipped: files.length - 1 }
}
