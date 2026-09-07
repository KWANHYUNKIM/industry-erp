package com.erp.settings.domain;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

/**
 * 수집데이터 소스 등록(E100000). 데이터센터 수집 화면이 읽는 소스 레지스트리.
 * 소스 = 우리 API 의 목록 GET 엔드포인트. 수집 실행은 그 엔드포인트를 호출해 행수를 집계한다.
 * (코드 배포 없이 소스를 추가/비활성할 수 있게 하드코딩을 테이블로 옮긴 것.)
 */
@Entity
@Table(name = "collect_sources")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class CollectSource extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 원본 수집데이터등록의 [데이터코드]. 이미 있는 행에는 없으므로 nullable 이다. */
    @Column(length = 20)
    private String code;

    /** 소스명 */
    @Column(nullable = false, length = 100)
    private String name;

    /** 구분(기준정보/재고/영업/구매/생산 등) */
    @Column(nullable = false, length = 40)
    private String category;

    /** 수집 대상 GET 엔드포인트 (예: /sales, /stock/transactions?page=0&size=1) */
    @Column(nullable = false, length = 200)
    private String endpoint;

    /** 페이지 응답(총건수는 totalElements)인지 여부 */
    @Column(nullable = false)
    @Builder.Default
    private boolean paged = false;

    @Column(name = "sort_order", nullable = false)
    @Builder.Default
    private int sortOrder = 0;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;
}
