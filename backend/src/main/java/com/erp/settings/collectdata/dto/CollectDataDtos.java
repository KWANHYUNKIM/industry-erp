package com.erp.settings.collectdata.dto;

import com.erp.settings.collectdata.CollectData;
import com.erp.settings.collectdata.CollectDocType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDateTime;

public final class CollectDataDtos {

    private CollectDataDtos() {}

    public record CreateCollectDataRequest(
            /* 비우면 서버가 다음 번호(00001 …)를 매긴다 — 원본 신규 창이 미리 채워 두는 값과 같다. */
            @Size(max = 20, message = "입력한 글자가 너무 깁니다. 20자까지 넣을 수 있습니다.")
            String code,
            @Size(max = 100, message = "데이터명은 100자까지 넣을 수 있습니다.")
            @NotBlank(message = "데이터명을 입력하세요.") String name,
            @NotNull(message = "수신문서를 고르세요.") CollectDocType docType,
            @Size(max = 100, message = "보낸회사는 100자까지 넣을 수 있습니다.")
            String senderCompany
    ) {}

    /** 원본 수정 창은 [데이터명] · [보낸회사] 만 열려 있다(데이터코드 · 수신문서는 막힘). */
    public record UpdateCollectDataRequest(
            @Size(max = 100, message = "데이터명은 100자까지 넣을 수 있습니다.")
            @NotBlank(message = "데이터명을 입력하세요.") String name,
            @Size(max = 100, message = "보낸회사는 100자까지 넣을 수 있습니다.")
            String senderCompany
    ) {}

    public record CollectDataResponse(
            Long id, String code, String name, String channel,
            CollectDocType docType, String docTypeLabel, String senderCompany,
            /* [진행상태] — 저장하면 바로 등록완료다(원본에 다른 값을 본 적이 없다). */
            String status,
            /* [조건] — '거래명세서' 또는 '거래명세서 AND 보낸회사' */
            String condition,
            /* [연결업무] — 기본 줄만 …수집 화면을 가리킨다. */
            String linkedTask,
            boolean builtIn,
            String createdBy, String updatedBy,
            LocalDateTime createdAt, LocalDateTime updatedAt
    ) {
        public static CollectDataResponse from(CollectData d) {
            String sender = d.getSenderCompany();
            String condition = d.getDocType().label()
                    + (sender == null || sender.isBlank() ? "" : " AND " + sender);
            return new CollectDataResponse(
                    d.getId(), d.getCode(), d.getName(), d.getChannel(),
                    d.getDocType(), d.getDocType().label(), sender,
                    "등록완료", condition,
                    d.isBuiltIn() ? d.getDocType().linkedTask() : null,
                    d.isBuiltIn(), d.getCreatedBy(), d.getUpdatedBy(),
                    d.getCreatedAt(), d.getUpdatedAt());
        }
    }
}
