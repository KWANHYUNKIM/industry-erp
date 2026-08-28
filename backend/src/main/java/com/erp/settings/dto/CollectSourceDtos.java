package com.erp.settings.dto;

import com.erp.settings.domain.CollectSource;
import jakarta.validation.constraints.NotBlank;

import java.time.LocalDateTime;

public final class CollectSourceDtos {

    private CollectSourceDtos() {}

    public record CreateCollectSourceRequest(
            /* 원본 [데이터코드]. 이미 있는 행에는 없으므로 필수가 아니다. */
            String code,
            @NotBlank(message = "소스명을 입력하세요.") String name,
            @NotBlank(message = "구분을 입력하세요.") String category,
            @NotBlank(message = "수집 엔드포인트를 입력하세요.") String endpoint,
            Boolean paged,
            Integer sortOrder
    ) {}

    public record UpdateCollectSourceRequest(
            String code,
            @NotBlank(message = "소스명을 입력하세요.") String name,
            @NotBlank(message = "구분을 입력하세요.") String category,
            @NotBlank(message = "수집 엔드포인트를 입력하세요.") String endpoint,
            Boolean paged,
            Integer sortOrder,
            Boolean active
    ) {}

    public record CollectSourceResponse(
            Long id, String code, String name, String category, String endpoint,
            boolean paged, int sortOrder, boolean active,
            /*
             * 원본 [최초작성일자]·[최종작업일자]. BaseTimeEntity 가 이미 들고 있던 값인데
             * <b>응답에 안 실려서</b> 화면이 볼 수도 거를 수도 없었다.
             */
            LocalDateTime createdAt, LocalDateTime updatedAt
    ) {
        public static CollectSourceResponse from(CollectSource s) {
            return new CollectSourceResponse(
                    s.getId(), s.getCode(), s.getName(), s.getCategory(), s.getEndpoint(),
                    s.isPaged(), s.getSortOrder(), s.isActive(),
                    s.getCreatedAt(), s.getUpdatedAt());
        }
    }
}
