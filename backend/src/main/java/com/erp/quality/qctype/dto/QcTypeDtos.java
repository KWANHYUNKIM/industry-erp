package com.erp.quality.qctype.dto;

import com.erp.quality.qctype.QcCheckFormat;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.util.List;

/** 품질검사유형등록(E040632) — 검사유형 · 검사항목 · 상세항목 · 검사항목설정 · 품목설정. */
public final class QcTypeDtos {

    private QcTypeDtos() {
    }

    /** 검사유형리스트 한 줄. checkSet · itemSet 은 원본 [검사항목설정] · [품목설정] 버튼이 파란가(설정함) 회색인가(안 함). */
    public record TypeResponse(Long id, String code, String name, boolean active, boolean checkSet, boolean itemSet) {
    }

    public record CreateTypeRequest(
            @NotBlank(message = "품질검사유형코드를 입력하세요.") String code,
            @NotBlank(message = "품질검사유형명을 입력하세요.") String name) {
    }

    public record UpdateTypeRequest(
            @NotBlank(message = "품질검사유형명을 입력하세요.") String name) {
    }

    /** [사용중단/재사용] — 고른 줄을 한꺼번에. active 가 null 이면 삭제다. */
    public record BulkRequest(@NotEmpty(message = "선택된 데이터가 없습니다.") List<Long> ids, Boolean active) {
    }

    public record CheckItemResponse(Long id, String code, String name, QcCheckFormat format, String formatName,
                                    boolean required, boolean active, int detailCount) {
    }

    /** 코드를 비우면 다음 번호(00001 …)를 매긴다 — 원본 신규 창이 그 번호를 미리 채워 둔다. */
    public record SaveCheckItemRequest(
            @NotNull(message = "형식을 선택하세요.") QcCheckFormat format,
            String code,
            @NotBlank(message = "검사항목명을 입력하세요.") String name,
            boolean required) {
    }

    public record DetailResponse(Long id, String code, String name, boolean active) {
    }

    public record SaveDetailRequest(String code, @NotBlank(message = "상세항목명을 입력하세요.") String name) {
    }

    /** [검사항목설정] 한 칸. format 은 고른 검사항목의 형식이다. */
    public record SlotResponse(QcCheckFormat format, int slot, Long checkItemId, String code, String name) {
    }

    public record SlotRequest(@NotNull Long checkItemId, @NotNull Integer slot) {
    }

    public record SaveSlotsRequest(@Valid List<SlotRequest> slots) {
    }

    public record TypeItemResponse(Long itemId, String code, String name, String spec) {
    }

    public record ItemIdsRequest(@NotEmpty(message = "품목을 선택하세요.") List<Long> itemIds) {
    }

    /** [품목별설정리스트] 한 줄 — 품목등록의 품질 칸 + 붙은 검사유형. */
    public record ItemSettingResponse(Long itemId, String code, String name, String spec,
                                      boolean qcOnPurchase, boolean qcOnProduction, String qcMethod,
                                      String typeCode, String typeName) {
    }
}
