package com.erp.groupware.supply;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

/**
 * 공용품관리 라벨 마스터 — 원본 E070204 [라벨] 🔍 '라벨검색창' · [라벨변경 ▾ › 라벨설정] '라벨조회'(2026-10-13 loginaa 실측).
 * 라벨코드 · 라벨명 · 색상. 일정관리 라벨({@code ScheduleLabel})과 다른 목록이다. 사용내역에는 이름으로 붙는다
 * ({@link SupplyUsage#getLabelText()}) — 목록 [제목] 앞의 둥근 칩(라벨 색 · 흰 글자)이 이것이다.
 */
@Entity
@Table(name = "supply_labels")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class SupplyLabel extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 20)
    private String code;

    @Column(nullable = false, length = 20)
    private String name;

    /** '#ff0000' 꼴. 기본 검정. */
    @Column(nullable = false, length = 7)
    private String color;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;
}
