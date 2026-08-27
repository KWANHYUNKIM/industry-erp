package com.erp.production.domain;

import com.erp.common.BaseTimeEntity;
import com.erp.inventory.domain.Item;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

/**
 * BOR(작업소요시간) 한 줄 — 품목이 거치는 <b>작업 하나</b>.
 *
 * <p>원본(이카운트) BOR 은 생산품목마다
 * &lt;생산공정 · 작업순서 · 작업명 · 작업시간(H)&gt; 을 적어 두는 마스터다.
 * BOM 이 "무엇으로 만드는가" 라면 BOR 은 <b>"어떻게 만드는가"</b> 다.
 *
 * <p>이 표가 없어서 그동안
 * <ul>
 *   <li>작업지시서효율현황의 '시간 표준' 은 <b>실제로 작업한 공정</b>만 되짚어 셀 수밖에 없었다
 *       — 안 한 작업은 표준에도 안 잡히니 "빼먹은 공정" 이 영영 안 보인다</li>
 *   <li>표준원가의 노무비는 배부할 근거가 없어 0 이었다</li>
 * </ul>
 */
@Entity
@Table(name = "bor_operations")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class BorOperation extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 생산품목 */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "product_id", nullable = false)
    private Item product;

    /** 생산공정 */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "process_id", nullable = false)
    private ProductionProcess process;

    /** 작업순서. 한 품목 안에서 겹치지 않는다. */
    @Column(nullable = false)
    private Integer seq;

    /** 작업명 (예: 절단, 조립, 검사) */
    @Column(name = "work_name", nullable = false, length = 100)
    private String workName;

    /**
     * 이 작업시간이 <b>몇 개를 만드는 기준</b>인가. 1개 기준이면 1, 100개 로트 기준이면 100.
     * 원본에도 [생산수량] 열이 그 자리에 있다.
     */
    @Column(name = "base_qty", nullable = false, precision = 15, scale = 3)
    @Builder.Default
    private BigDecimal baseQty = BigDecimal.ONE;

    /** 작업시간(H). 소수 3자리 — 6분은 0.1시간이다. */
    @Column(name = "work_hours", nullable = false, precision = 10, scale = 3)
    @Builder.Default
    private BigDecimal workHours = BigDecimal.ZERO;

    @Column(length = 255)
    private String remark;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;
}
