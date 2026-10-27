package com.erp.trade.shipmentorder;

import org.springframework.data.jpa.repository.JpaRepository;

/** 출하지시서 줄 — 출하입력 [출하지시] 로 이은 출하 줄이 이 줄을 가리킨다(같은 trade 모듈의 출하 서비스가 쓴다). */
public interface ShipmentOrderLineRepository extends JpaRepository<ShipmentOrderLine, Long> {
}
