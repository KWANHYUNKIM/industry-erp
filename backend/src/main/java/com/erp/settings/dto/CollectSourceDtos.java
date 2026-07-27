package com.erp.settings.dto;

import com.erp.settings.domain.CollectSource;
import jakarta.validation.constraints.NotBlank;

public final class CollectSourceDtos {

    private CollectSourceDtos() {}

    public record CreateCollectSourceRequest(
            @NotBlank(message = "소스명을 입력하세요.") String name,
            @NotBlank(message = "구분을 입력하세요.") String category,
            @NotBlank(message = "수집 엔드포인트를 입력하세요.") String endpoint,
            Boolean paged,
            Integer sortOrder
    ) {}

    public record UpdateCollectSourceRequest(
            @NotBlank(message = "소스명을 입력하세요.") String name,
            @NotBlank(message = "구분을 입력하세요.") String category,
            @NotBlank(message = "수집 엔드포인트를 입력하세요.") String endpoint,
            Boolean paged,
            Integer sortOrder,
            Boolean active
    ) {}

    public record CollectSourceResponse(
            Long id, String name, String category, String endpoint,
            boolean paged, int sortOrder, boolean active
    ) {
        public static CollectSourceResponse from(CollectSource s) {
            return new CollectSourceResponse(
                    s.getId(), s.getName(), s.getCategory(), s.getEndpoint(),
                    s.isPaged(), s.getSortOrder(), s.isActive());
        }
    }
}
