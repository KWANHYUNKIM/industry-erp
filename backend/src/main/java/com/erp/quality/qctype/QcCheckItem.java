package com.erp.quality.qctype;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

/**
 * 원본 품질검사유형등록 › [검사항목등록] 의 한 줄 — 검사할 때 적는 항목(외관검사 · 부품누락여부 · 비고 …).
 * 형식이 코드형식이면 고를 값을 [상세항목]({@link QcCheckItemDetail})으로 따로 든다.
 */
@Entity
@Table(name = "quality_check_items")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class QcCheckItem extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 20)
    private String code;

    @Column(nullable = false, length = 100)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private QcCheckFormat format;

    /** 원본 [필수입력항목] Y/N — 기본 Y. */
    @Column(nullable = false)
    @Builder.Default
    private boolean required = true;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;
}
