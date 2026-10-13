import { useState } from 'react'
import type { DriveDocument } from '../../../types/api'

/** 드라이브 안의 한 곳 — parentId 가 null 이면 그 드라이브 맨 위. */
export type DrivePlace = { drive: 'MY' | 'SHARED'; parentId: number | null }

/** 단계마다 14 씩 들어간다(맨 위 폴더 28). 일곱 단계 넘게는 같은 자리. */
const INDENT = ['pl-[14px]', 'pl-[28px]', 'pl-[42px]', 'pl-[56px]', 'pl-[70px]', 'pl-[84px]', 'pl-[98px]', 'pl-[112px]']

/**
 * 원본 ECDrive 나무 — My Drive · Shared Drive 아래로 폴더가 <b>여러 단계</b> 선다. 안에 폴더가 있으면 ▸ 로
 * 접고 편다. 같은 단계 안의 차례는 만든 차례다(원본: '영업공유' 다음에 나중에 만든 'QA그룹웨어-폴더3').
 * 본 화면 왼쪽과 [이동] · [복사] 창이 같이 쓴다.
 */
export default function DriveFolderTree({
  folders, place, onOpen, onContextMenu, extra, onFolderContextMenu, folderExtra,
}: {
  folders: DriveDocument[]
  place: DrivePlace | null
  onOpen: (p: DrivePlace) => void
  /** 드라이브 머리(My Drive · Shared Drive) 우클릭 */
  onContextMenu?: (drive: 'MY' | 'SHARED', e: React.MouseEvent) => void
  /** 드라이브 머리 바로 아래 붙일 것(우클릭 메뉴) */
  extra?: (drive: 'MY' | 'SHARED') => React.ReactNode
  /** 폴더 줄 우클릭(원본: 새 폴더 · 이동 · 복사 · 이름변경 · 휴지통으로이동 · 버전/이력 · 상세보기) */
  onFolderContextMenu?: (f: DriveDocument) => void
  /** 폴더 줄 바로 아래 붙일 것(우클릭 메뉴) */
  folderExtra?: (f: DriveDocument) => React.ReactNode
}) {
  const [closed, setClosed] = useState<Set<number>>(new Set())
  const kids = (drive: string, pid: number | null) =>
    folders.filter((f) => f.drive === drive && f.parentId === pid).sort((a, b) => a.id - b.id)
  const toggle = (id: number) => setClosed((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const on = (drive: string, pid: number | null) => !!place && place.drive === drive && place.parentId === pid

  const branch = (drive: 'MY' | 'SHARED', pid: number | null, depth: number): React.ReactNode =>
    kids(drive, pid).map((f) => {
      const sub = kids(drive, f.id)
      const open = !closed.has(f.id)
      return (
        <div key={f.id}>
          <div onContextMenu={(e) => { if (onFolderContextMenu) { e.preventDefault(); onFolderContextMenu(f) } }}
               className={`relative flex items-center w-full py-[4px] pr-[10px] text-[12px] ${INDENT[Math.min(depth, INDENT.length - 1)]} ${on(drive, f.id) ? 'bg-ec-blue-wash text-ec-blue font-bold' : 'text-ec-text'}`}>
            <button type="button" className="no-ec w-[12px] bg-transparent border-0 p-0 cursor-pointer text-ec-label text-[10px]"
                    onClick={() => sub.length && toggle(f.id)}>{sub.length ? (open ? '▾' : '▸') : ''}</button>
            <button type="button" className="no-ec flex-1 text-left bg-transparent border-0 p-0 cursor-pointer text-inherit font-inherit truncate"
                    onClick={() => onOpen({ drive, parentId: f.id })}>📁 {f.name}</button>
            {folderExtra?.(f)}
          </div>
          {open && branch(drive, f.id, depth + 1)}
        </div>
      )
    })

  return (
    <>
      {(['MY', 'SHARED'] as const).map((drive) => (
        <div key={drive} className="relative">
          <button type="button" onClick={() => onOpen({ drive, parentId: null })}
                  onContextMenu={(e) => { if (onContextMenu) { e.preventDefault(); onContextMenu(drive, e) } }}
                  className={`no-ec flex items-center gap-[6px] w-full text-left py-[7px] px-[14px] text-[12.5px] border-0 cursor-pointer ${
                    on(drive, null) ? 'bg-ec-blue-wash text-ec-blue font-bold' : 'bg-transparent text-ec-text'}`}>
            <span>{drive === 'MY' ? '📁' : '👥'}</span>{drive === 'MY' ? 'My Drive' : 'Shared Drive'}
          </button>
          {extra?.(drive)}
          {branch(drive, null, 1)}
        </div>
      ))}
    </>
  )
}
