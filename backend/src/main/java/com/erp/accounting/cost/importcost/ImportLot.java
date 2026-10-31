package com.erp.accounting.cost.importcost;

import com.erp.common.BaseTimeEntity;
import com.erp.trade.partner.BusinessPartner;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;

/**
 * 관리번호(원본 E060201 관리번호등록) — 수입 한 건(L/C · B/L 단위). 수입비용 전표 여섯 가지가 모두 이것에 붙는다.
 * 원본은 삭제 단추가 없고 [사용중단/재사용] 만 있다.
 */
@Entity
@Table(name = "import_lots")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ImportLot extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 30)
    private String code;

    @Column(nullable = false, length = 100)
    private String name;

    /** 거래처(수출자). */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "partner_id", nullable = false)
    private BusinessPartner partner;

    @Column(name = "first_trade_date")
    private LocalDate firstTradeDate;

    @Column(length = 300)
    private String remark;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;
}
