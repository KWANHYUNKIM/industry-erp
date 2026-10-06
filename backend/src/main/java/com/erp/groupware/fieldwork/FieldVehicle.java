package com.erp.groupware.fieldwork;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

/**
 * 외근 이동수단 — 원본 '이동수단등록'(이동수단코드 · 이동수단명 · 구분 차량/차량아님 · 차종).
 * 외근 기록은 고른 코드 · 이름을 글자로 적어 두므로 여기와 FK 로 잇지 않는다.
 */
@Entity
@Table(name = "field_vehicles")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class FieldVehicle extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 30)
    private String code;

    @Column(nullable = false, length = 100)
    private String name;

    /** 구분 — 차량이면 true, 차량아님이면 false. */
    @Column(name = "is_vehicle", nullable = false)
    @Builder.Default
    private boolean vehicle = true;

    /** 차종 — 경차 · 소형차 · 준중형차 · 중형차 · 대형차 · 승합차 · 화물차. 차량아님이면 null. */
    @Column(name = "car_type", length = 20)
    private String carType;

    /** 원본 [사용중단/재사용]. */
    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;
}
