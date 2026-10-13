package com.erp.trade.settlement;

import java.math.BigDecimal;
import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.trade.partner.BusinessPartner;
import com.erp.trade.settlement.dto.SettlementDtos.CreateSettlementRequest;
import com.erp.trade.settlement.dto.SettlementDtos.SettlementResponse;
import com.erp.trade.partner.BusinessPartnerRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import com.erp.trade.settlement.dto.SettlementDtos;

@Service
@RequiredArgsConstructor
public class SettlementService {

    private final SettlementRepository settlementRepository;
    private final com.erp.inventory.project.ProjectService projectService;
    private final BusinessPartnerRepository partnerRepository;
    private final DocumentNoGenerator docNoGenerator;

    /**
     * 기간 안의 정산 전표를 <b>줄 단위로</b> 낸다(유형별).
     * 거래처관리대장 I 의 [전표별] 원장이 수금·지급을 세울 때 쓰는 자리다 —
     * 회계(accounting)가 이 서비스를 거쳐 부른다(다른 모듈의 리포지토리를 직접 안 쓴다).
     */
    @Transactional(readOnly = true)
    public List<SettlementResponse> findBetween(SettlementType type, LocalDate from, LocalDate to) {
        return settlementRepository.findByTypeAndSettleDateBetweenWithPartner(type, from, to)
                .stream().map(SettlementResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public List<SettlementResponse> findAll() {
        return settlementRepository.findAllWithPartner().stream()
                .map(SettlementResponse::from)
                .toList();
    }

    @Transactional
    public SettlementResponse create(CreateSettlementRequest req, String username) {
        BusinessPartner partner = partnerRepository.findById(req.partnerId())
                .orElseThrow(() -> ApiException.notFound("거래처를 찾을 수 없습니다. id=" + req.partnerId()));

        /*
         * 음수 금액은 <b>되돌린 돈</b>이다. 반품으로 매출처에 돌려줄 돈(채권 −13,200)이 생겼는데
         * 수금은 0보다 커야 하고 지급은 매입처만 고를 수 있어 환불을 넣을 길이 없었다(27회차).
         * 수금 −13,200 이면 채권이 13,200 늘어 0 이 되고, 회계반영은 차)외상매출금 / 대)예금 으로 선다
         * (분개의 음수는 반대편 양수로 — JournalService). 0 은 아무 일도 아니라 막는다.
         */
        if (req.amount().signum() == 0) {
            throw ApiException.badRequest("금액을 입력하세요. 돌려준 돈(환불)은 음수로 적습니다.");
        }
        LocalDate date = req.settleDate() != null ? req.settleDate() : LocalDate.now();
        BigDecimal fee = req.fee() != null ? req.fee() : BigDecimal.ZERO;
        if (fee.signum() > 0) {
            if (req.amount().signum() < 0) {
                throw ApiException.badRequest("되돌린 돈(음수)에는 수수료를 적지 않습니다.");
            }
            // 수금은 amount(채권 감소 총액)에서 수수료가 떼이므로 그보다 작아야 한다. 지급은 수수료가 따로 더 나간다.
            if (req.type() == SettlementType.RECEIPT && fee.compareTo(req.amount()) >= 0) {
                throw ApiException.badRequest("수수료는 수금 금액보다 작아야 합니다.");
            }
        }

        Settlement s = Settlement.builder()
                .docNo(generateDocNo(req.type(), date))
                .type(req.type())
                .partner(partner)
                .settleDate(date)
                .amount(req.amount())
                .fee(fee)
                .bankAccountId(req.bankAccountId())
                .departmentId(req.departmentId())
                .method(req.method())
                .project(req.projectId() != null ? projectService.get(req.projectId()) : null)
                .note(req.note())
                .createdBy(username)
                .build();

        return SettlementResponse.from(settlementRepository.save(s));
    }

    /**
     * 정산 전표 삭제.
     *
     * <p>없어서 잘못 넣은 수금·지급을 지울 방법이 아예 없었다. 정산은 거래처 채권·채무 잔액에
     * 그대로 반영되므로, 못 지우면 오타 하나가 잔액을 영구히 틀리게 만든다.
     *
     * <p>재고처럼 되돌릴 것이 없다(정산은 금액만 남긴다). 잔액은 정산 목록을 합쳐서 내므로
     * 행을 지우면 그대로 맞아 들어간다.
     */
    @Transactional
    public void delete(Long id) {
        Settlement s = settlementRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("정산 전표를 찾을 수 없습니다. id=" + id));
        // 판매·구매와 같은 규칙이다. 지우면 분개만 남아 원장이 전표를 잃는다.
        if (s.isAccountingReflected()) {
            throw ApiException.badRequest(
                    "회계반영된 결제전표는 삭제할 수 없습니다. 회계반영을 먼저 취소하세요: " + s.getDocNo());
        }
        settlementRepository.delete(s);
    }

    private String generateDocNo(SettlementType type, LocalDate date) {
        String prefix = type == SettlementType.RECEIPT ? "RC-" : "PY-";
        return docNoGenerator.next(prefix, "settlements", "doc_no", "settle_date", date);
    }
}
