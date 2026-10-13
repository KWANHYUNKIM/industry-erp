package com.erp.groupware.multislip;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * 다목적 전표 한 장 — 원본 목록 한 줄은 이 전표의 첫 줄이고, 번호는 `일자-순번`(2026/10/14-1).
 * 순번은 그 게시판 · 그 날의 최대 + 1.
 */
@Entity
@Table(name = "multi_slips")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class MultiSlip extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private MultiSlipBoard board;

    @Column(name = "slip_date", nullable = false)
    private LocalDate slipDate;

    @Column(name = "slip_no", nullable = false)
    private int slipNo;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private MultiSlipStatus status = MultiSlipStatus.IN_PROGRESS;

    @OneToMany(mappedBy = "slip", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("lineNo asc")
    @Builder.Default
    private List<MultiSlipLine> lines = new ArrayList<>();
}
