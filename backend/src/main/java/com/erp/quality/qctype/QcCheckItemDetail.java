package com.erp.quality.qctype;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

/** 원본 검사항목리스트 › [상세항목] — 코드형식 검사항목에서 고르는 값(상세항목코드 · 상세항목명 · 사용). */
@Entity
@Table(name = "quality_check_item_details")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class QcCheckItemDetail extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "check_item_id")
    private QcCheckItem checkItem;

    @Column(nullable = false, length = 20)
    private String code;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;
}
