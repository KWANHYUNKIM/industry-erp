import { api } from '../../api/client'

/** MyPage 나만의 업무 폴더 (서버 /api/my-folders — 로그인한 사람 자신의 것). */
export interface MyFolderItem { id: number; label: string; path: string; sortOrder: number }
export interface MyFolder { id: number; name: string; sortOrder: number; items: MyFolderItem[] }

/**
 * 폴더를 바꾸면 머리 메뉴(EcountLayout)도 다시 그려야 한다. 둘은 서로 모르는 자리라
 * 창 이벤트 하나로 알린다 — 바꾼 뒤의 목록을 그대로 실어 보내 다시 부르지 않게 한다.
 */
export const MY_FOLDERS_EVENT = 'my-folders-changed'

function announce(list: MyFolder[]) {
  window.dispatchEvent(new CustomEvent<MyFolder[]>(MY_FOLDERS_EVENT, { detail: list }))
  return list
}

const run = (p: Promise<{ data: MyFolder[] }>) => p.then((r) => announce(r.data))

export const myFolders = {
  list: () => api.get<MyFolder[]>('/my-folders').then((r) => r.data),
  createFolder: (name: string) => run(api.post<MyFolder[]>('/my-folders', { name })),
  renameFolder: (id: number, name: string) => run(api.put<MyFolder[]>(`/my-folders/${id}`, { name })),
  deleteFolder: (id: number) => run(api.delete<MyFolder[]>(`/my-folders/${id}`)),
  reorderFolders: (ids: number[]) => run(api.put<MyFolder[]>('/my-folders/order', { ids })),
  addItem: (folderId: number, label: string, path: string) =>
    run(api.post<MyFolder[]>(`/my-folders/${folderId}/items`, { label, path })),
  renameItem: (itemId: number, label: string) => run(api.put<MyFolder[]>(`/my-folders/items/${itemId}`, { label })),
  deleteItem: (itemId: number) => run(api.delete<MyFolder[]>(`/my-folders/items/${itemId}`)),
  reorderItems: (folderId: number, ids: number[]) =>
    run(api.put<MyFolder[]>(`/my-folders/${folderId}/items/order`, { ids })),
}
