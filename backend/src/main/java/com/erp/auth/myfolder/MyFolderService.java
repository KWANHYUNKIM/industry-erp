package com.erp.auth.myfolder;

import com.erp.auth.myfolder.dto.MyFolderDtos.AddItemRequest;
import com.erp.auth.myfolder.dto.MyFolderDtos.FolderRequest;
import com.erp.auth.myfolder.dto.MyFolderDtos.FolderResponse;
import com.erp.auth.myfolder.dto.MyFolderDtos.ItemResponse;
import com.erp.auth.myfolder.dto.MyFolderDtos.RenameItemRequest;
import com.erp.auth.user.User;
import com.erp.auth.user.UserRepository;
import com.erp.common.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.ToIntFunction;

/**
 * MyPage 나만의 업무 폴더 — 폴더와 담은 화면을 사용자별로 만들고 고치고 지운다.
 *
 * <p>로그인한 사람 자신의 것만 다룬다. 남의 폴더 id 를 보내면 '없다' 고 답한다(있는지조차 알려 주지 않는다).
 * 바꾸는 요청은 모두 바뀐 뒤의 폴더 목록 전체를 돌려준다 — 화면은 그걸 그대로 메뉴로 그린다.
 */
@Service
@RequiredArgsConstructor
public class MyFolderService {

    private final UserMenuFolderRepository folderRepository;
    private final UserMenuFolderItemRepository itemRepository;
    private final UserRepository userRepository;

    @Transactional(readOnly = true)
    public List<FolderResponse> findMine(Long userId) {
        Map<Long, List<ItemResponse>> byFolder = new LinkedHashMap<>();
        for (UserMenuFolderItem i : itemRepository.findAllOfUser(userId)) {
            byFolder.computeIfAbsent(i.getFolder().getId(), k -> new java.util.ArrayList<>()).add(ItemResponse.from(i));
        }
        return folderRepository.findByUser_IdOrderBySortOrderAscIdAsc(userId).stream()
                .map(f -> FolderResponse.of(f, byFolder.getOrDefault(f.getId(), List.of())))
                .toList();
    }

    @Transactional
    public List<FolderResponse> createFolder(Long userId, FolderRequest req) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> ApiException.notFound("사용자를 찾을 수 없습니다. id=" + userId));
        int next = nextOrder(folderRepository.findByUser_IdOrderBySortOrderAscIdAsc(userId), UserMenuFolder::getSortOrder);
        folderRepository.save(UserMenuFolder.builder().user(user).name(req.name().trim()).sortOrder(next).build());
        return findMine(userId);
    }

    @Transactional
    public List<FolderResponse> renameFolder(Long userId, Long folderId, FolderRequest req) {
        owned(userId, folderId).setName(req.name().trim());
        return findMine(userId);
    }

    /** 폴더를 지우면 담은 화면도 함께 지운다(화면 자체가 아니라 폴더 안의 바로가기다). */
    @Transactional
    public List<FolderResponse> deleteFolder(Long userId, Long folderId) {
        UserMenuFolder f = owned(userId, folderId);
        itemRepository.deleteByFolder_Id(f.getId());
        folderRepository.delete(f);
        return findMine(userId);
    }

    @Transactional
    public List<FolderResponse> reorderFolders(Long userId, List<Long> ids) {
        List<UserMenuFolder> mine = folderRepository.findByUser_IdOrderBySortOrderAscIdAsc(userId);
        applyOrder(mine, ids, UserMenuFolder::getId, UserMenuFolder::setSortOrder);
        return findMine(userId);
    }

    @Transactional
    public List<FolderResponse> addItem(Long userId, Long folderId, AddItemRequest req) {
        UserMenuFolder f = owned(userId, folderId);
        String path = req.path().trim();
        if (itemRepository.existsByFolder_IdAndPath(f.getId(), path)) {
            throw ApiException.conflict("이미 폴더에 담은 메뉴입니다: " + req.label().trim());
        }
        int next = nextOrder(itemRepository.findByFolder_IdOrderBySortOrderAscIdAsc(f.getId()), UserMenuFolderItem::getSortOrder);
        itemRepository.save(UserMenuFolderItem.builder()
                .folder(f).label(req.label().trim()).path(path).sortOrder(next).build());
        return findMine(userId);
    }

    @Transactional
    public List<FolderResponse> renameItem(Long userId, Long itemId, RenameItemRequest req) {
        ownedItem(userId, itemId).setLabel(req.label().trim());
        return findMine(userId);
    }

    @Transactional
    public List<FolderResponse> deleteItem(Long userId, Long itemId) {
        itemRepository.delete(ownedItem(userId, itemId));
        return findMine(userId);
    }

    @Transactional
    public List<FolderResponse> reorderItems(Long userId, Long folderId, List<Long> ids) {
        UserMenuFolder f = owned(userId, folderId);
        applyOrder(itemRepository.findByFolder_IdOrderBySortOrderAscIdAsc(f.getId()), ids,
                UserMenuFolderItem::getId, UserMenuFolderItem::setSortOrder);
        return findMine(userId);
    }

    private UserMenuFolder owned(Long userId, Long folderId) {
        return folderRepository.findByIdAndUser_Id(folderId, userId)
                .orElseThrow(() -> ApiException.notFound("폴더를 찾을 수 없습니다."));
    }

    private UserMenuFolderItem ownedItem(Long userId, Long itemId) {
        return itemRepository.findOwned(itemId, userId)
                .orElseThrow(() -> ApiException.notFound("폴더에 담은 메뉴를 찾을 수 없습니다."));
    }

    private static <T> int nextOrder(List<T> rows, ToIntFunction<T> order) {
        return rows.stream().mapToInt(order).max().orElse(-1) + 1;
    }

    /**
     * 보낸 id 차례대로 0, 1, 2 … 를 매긴다. 보낸 목록이 지금 있는 것과 정확히 같아야 한다 —
     * 하나라도 빠지거나 남의 것이 끼면 순서가 겹치거나 남의 것을 건드리게 된다.
     */
    private static <T> void applyOrder(List<T> rows, List<Long> ids,
                                       java.util.function.Function<T, Long> idOf,
                                       java.util.function.ObjIntConsumer<T> setOrder) {
        if (ids.size() != rows.size() || !new HashSet<>(ids).equals(new HashSet<>(rows.stream().map(idOf).toList()))) {
            throw ApiException.badRequest("순서를 바꿀 목록이 지금 목록과 다릅니다. 화면을 새로 고친 뒤 다시 하세요.");
        }
        Map<Long, T> byId = new LinkedHashMap<>();
        rows.forEach(r -> byId.put(idOf.apply(r), r));
        for (int i = 0; i < ids.size(); i++) setOrder.accept(byId.get(ids.get(i)), i);
    }
}
