package com.erp.auth.myfolder;

import com.erp.auth.myfolder.dto.MyFolderDtos.AddItemRequest;
import com.erp.auth.myfolder.dto.MyFolderDtos.FolderRequest;
import com.erp.auth.myfolder.dto.MyFolderDtos.FolderResponse;
import com.erp.auth.myfolder.dto.MyFolderDtos.OrderRequest;
import com.erp.auth.myfolder.dto.MyFolderDtos.RenameItemRequest;
import com.erp.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** MyPage 나만의 업무 폴더. 로그인한 사람 자신의 폴더만 다룬다 — 남의 것을 건드릴 경로를 두지 않는다. */
@RestController
@RequestMapping("/api/my-folders")
@RequiredArgsConstructor
public class MyFolderController {

    private final MyFolderService myFolderService;

    @GetMapping
    public List<FolderResponse> mine(@AuthenticationPrincipal UserPrincipal me) {
        return myFolderService.findMine(me.getId());
    }

    @PostMapping
    public List<FolderResponse> createFolder(@AuthenticationPrincipal UserPrincipal me,
                                             @Valid @RequestBody FolderRequest req) {
        return myFolderService.createFolder(me.getId(), req);
    }

    @PutMapping("/{id}")
    public List<FolderResponse> renameFolder(@AuthenticationPrincipal UserPrincipal me, @PathVariable Long id,
                                             @Valid @RequestBody FolderRequest req) {
        return myFolderService.renameFolder(me.getId(), id, req);
    }

    @DeleteMapping("/{id}")
    public List<FolderResponse> deleteFolder(@AuthenticationPrincipal UserPrincipal me, @PathVariable Long id) {
        return myFolderService.deleteFolder(me.getId(), id);
    }

    @PutMapping("/order")
    public List<FolderResponse> reorderFolders(@AuthenticationPrincipal UserPrincipal me,
                                               @Valid @RequestBody OrderRequest req) {
        return myFolderService.reorderFolders(me.getId(), req.ids());
    }

    @PostMapping("/{id}/items")
    public List<FolderResponse> addItem(@AuthenticationPrincipal UserPrincipal me, @PathVariable Long id,
                                        @Valid @RequestBody AddItemRequest req) {
        return myFolderService.addItem(me.getId(), id, req);
    }

    @PutMapping("/{id}/items/order")
    public List<FolderResponse> reorderItems(@AuthenticationPrincipal UserPrincipal me, @PathVariable Long id,
                                             @Valid @RequestBody OrderRequest req) {
        return myFolderService.reorderItems(me.getId(), id, req.ids());
    }

    @PutMapping("/items/{itemId}")
    public List<FolderResponse> renameItem(@AuthenticationPrincipal UserPrincipal me, @PathVariable Long itemId,
                                           @Valid @RequestBody RenameItemRequest req) {
        return myFolderService.renameItem(me.getId(), itemId, req);
    }

    @DeleteMapping("/items/{itemId}")
    public List<FolderResponse> deleteItem(@AuthenticationPrincipal UserPrincipal me, @PathVariable Long itemId) {
        return myFolderService.deleteItem(me.getId(), itemId);
    }
}
