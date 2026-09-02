package com.erp.production.domain;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

/**
 * 작업코드 — 한 공정 안에서 하는 작업. 원본 공정등록의 [작업코드등록] 이다.
 *
 * <p>BOR(작업소요시간)의 작업명을 자유입력으로 두면 같은 작업이 '절단'·'절단작업'·'컷팅' 으로
 * 여러 이름이 되고, 그러면 공정별 집계가 갈라진다. 마스터에 두면 이름이 하나로 모인다.
 */
@Entity
@Table(name = "process_operations")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ProcessOperation extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "process_id", nullable = false)
    private ProductionProcess process;

    /** 작업코드. 회사 안에서 유일하다. */
    @Column(nullable = false, unique = true, length = 30)
    private String code;

    @Column(nullable = false, length = 100)
    private String name;

    /** 공정 안에서의 순서 */
    @Column(nullable = false)
    @Builder.Default
    private Integer seq = 0;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;
}
