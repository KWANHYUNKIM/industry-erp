package com.erp.auth.dto;

import com.erp.auth.domain.UserBookmark;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotBlank;

public final class BookmarkDtos {

    private BookmarkDtos() {}

    public record CreateBookmarkRequest(
            @Size(max = 100, message = "북마크 이름은 100자까지 넣을 수 있습니다.")
            @NotBlank(message = "북마크 이름을 입력하세요.") String label,
            @Size(max = 200, message = "북마크 경로는 200자까지 넣을 수 있습니다.")
            @NotBlank(message = "북마크 경로를 입력하세요.") String path
    ) {}

    public record BookmarkResponse(Long id, String label, String path, int sortOrder) {
        public static BookmarkResponse from(UserBookmark b) {
            return new BookmarkResponse(b.getId(), b.getLabel(), b.getPath(), b.getSortOrder());
        }
    }
}
