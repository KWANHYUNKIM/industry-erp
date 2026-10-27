package com.erp.auth.myfolder.dto;

import com.erp.auth.myfolder.UserMenuFolder;
import com.erp.auth.myfolder.UserMenuFolderItem;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.List;

public final class MyFolderDtos {

    private MyFolderDtos() {}

    /** 폴더 만들기 · 이름 바꾸기. */
    public record FolderRequest(
            @Size(max = 100, message = "폴더명은 100자까지 넣을 수 있습니다.")
            @NotBlank(message = "폴더명을 입력하세요.") String name
    ) {}

    /** 폴더에 화면 담기. */
    public record AddItemRequest(
            @Size(max = 100, message = "메뉴명은 100자까지 넣을 수 있습니다.")
            @NotBlank(message = "메뉴명을 입력하세요.") String label,
            @Size(max = 200, message = "메뉴 경로는 200자까지 넣을 수 있습니다.")
            @Pattern(regexp = "/.*", message = "메뉴 경로가 올바르지 않습니다.")
            @NotBlank(message = "담을 메뉴를 고르세요.") String path
    ) {}

    /** 담은 화면의 메뉴명 바꾸기. */
    public record RenameItemRequest(
            @Size(max = 100, message = "메뉴명은 100자까지 넣을 수 있습니다.")
            @NotBlank(message = "메뉴명을 입력하세요.") String label
    ) {}

    /** 순서 바꾸기 — 바뀐 차례대로 id 를 모두 보낸다. */
    public record OrderRequest(@NotNull(message = "순서를 보내세요.") List<Long> ids) {}

    public record ItemResponse(Long id, String label, String path, int sortOrder) {
        public static ItemResponse from(UserMenuFolderItem i) {
            return new ItemResponse(i.getId(), i.getLabel(), i.getPath(), i.getSortOrder());
        }
    }

    public record FolderResponse(Long id, String name, int sortOrder, List<ItemResponse> items) {
        public static FolderResponse of(UserMenuFolder f, List<ItemResponse> items) {
            return new FolderResponse(f.getId(), f.getName(), f.getSortOrder(), items);
        }
    }
}
