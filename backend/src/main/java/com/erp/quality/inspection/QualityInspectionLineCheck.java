package com.erp.quality.inspection;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 품질검사 줄의 [검사항목] 값 하나 — 원본 [내역] 창에서 적은 것(2026-10-12 loginaa 실측).
 * 코드형식이면 고른 상세항목(detailId)과 그 이름을, 숫자형식 · 문자형식이면 적은 글자를 value 로 든다.
 * 검사항목은 품질검사유형등록(qctype)의 것이라 id 만 든다.
 */
@Embeddable
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
public class QualityInspectionLineCheck {

    @Column(name = "check_item_id", nullable = false)
    private Long checkItemId;

    @Column(name = "detail_id")
    private Long detailId;

    @Column(nullable = false, length = 200)
    private String value;
}
