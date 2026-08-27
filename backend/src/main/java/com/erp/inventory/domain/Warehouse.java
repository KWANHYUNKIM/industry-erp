package com.erp.inventory.domain;

import jakarta.persistence.*;
import lombok.*;
import com.erp.common.BaseTimeEntity;

/**
 * 창고 마스터.
 */
@Entity
@Table(name = "warehouses")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class Warehouse extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 창고코드 (예: WH-01) */
    @Column(nullable = false, unique = true, length = 50)
    private String code;

    /** 창고명 */
    @Column(nullable = false, length = 100)
    private String name;

    /** 위치/주소 */
    @Column(length = 200)
    private String location;

    /**
     * 구분 — 창고 · 공장 · 외주. 원본 창고등록리스트의 [구분] 열.
     *
     * <p>생산이 일어나는 <b>공장</b>과 그냥 쌓아 두는 <b>창고</b>는 뜻이 다르다.
     * 원본 자료에서도 '반제품제조'·'완제품제조' 는 공장이고 거기에 생산공정이 붙어 있다.
     */
    @Column(nullable = false, length = 20)
    @Builder.Default
    private String kind = "창고";

    /**
     * 생산공정 id. 구분이 공장일 때 그 공장이 맡는 공정이다.
     *
     * <p><b>@ManyToOne 이 아니라 id 만 든다.</b> {@code inventory} 는 아무 모듈에도 의존하지
     * 않는 기반층이라(CLAUDE.md 4.1), 여기서 {@code production.ProductionProcess} 를 참조하면
     * production → inventory 와 맞물려 순환이 된다. 이름은 화면이 공정 목록에서 붙인다.
     */
    @Column(name = "process_id")
    private Long processId;

    /**
     * 외주거래처 id. 구분이 외주일 때 <b>어느 외주처에 나가 있는 자재인지</b>를 가리킨다.
     * 이것도 같은 이유로 id 만 든다(trade → inventory 가 이미 있다).
     */
    @Column(name = "outsourcing_partner_id")
    private Long outsourcingPartnerId;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;
}
