package com.erp.quality.qctype;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 원본 [검사항목설정] 창의 한 칸 — 코드형검사항목1~4 · 숫자형검사항목1~4 · 문자형검사항목1~4 중 하나.
 * 칸의 형식은 고른 검사항목의 형식이라 칸 번호(1~4)만 든다.
 */
@Embeddable
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
public class QcTypeCheckSlot {

    @Column(name = "check_item_id", nullable = false)
    private Long checkItemId;

    @Column(nullable = false)
    private Short slot;
}
