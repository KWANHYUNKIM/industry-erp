package com.erp.accounting.billingcontract;

import com.erp.accounting.billingcontract.dto.BillingContractDtos.BillableLine;
import com.erp.accounting.billingcontract.dto.BillingContractDtos.BillingUnitResponse;
import com.erp.accounting.billingcontract.dto.BillingContractDtos.ContractResponse;
import com.erp.accounting.billingcontract.dto.BillingContractDtos.SaveContractRequest;
import com.erp.accounting.billingcontract.dto.BillingContractDtos.SaveLine;
import com.erp.accounting.contractitem.ContractItemService;
import com.erp.common.ApiException;
import com.erp.inventory.project.ProjectService;
import com.erp.trade.partner.PartnerService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 회계 II › 계약관리 › 계약입력(E060902) · 계약조회(E060903) — 2026-10-13 loginaa 실측.
 *
 * <p>저장하면 안내 없이 새 빈 입력판(다음 계약코드)으로 바뀐다. 청구종료일 · 줄의 청구단위가 비면 칸을 빨갛게 막는다.
 * 줄의 부가세는 공급가액의 10%(수량 2 × 단가 10,000 → 20,000 · 2,000).
 */
@Service
@RequiredArgsConstructor
public class BillingContractService {

    private final BillingContractRepository repository;
    private final BillingUnitRepository unitRepository;
    private final ContractItemService itemService;
    private final PartnerService partnerService;
    private final ProjectService projectService;

    @Transactional(readOnly = true)
    public List<ContractResponse> findAll(LocalDate from, LocalDate to) {
        List<BillingContract> cs = repository.findInPeriod(
                from != null ? from : LocalDate.of(1900, 1, 1), to != null ? to : LocalDate.of(9999, 12, 31));
        return withLines(cs);
    }

    @Transactional(readOnly = true)
    public ContractResponse findOne(Long id) {
        return withLines(List.of(get(id))).get(0);
    }

    /** 계약입력의 [계약코드] 기본값 — 지금까지의 숫자 코드 다음 번호, 5자리('00017'). */
    @Transactional(readOnly = true)
    public String nextCode() {
        return String.format("%05d", repository.maxNumericCode() + 1);
    }

    @Transactional(readOnly = true)
    public List<BillingUnitResponse> units() {
        return unitRepository.findAllByOrderByCodeAsc().stream().map(BillingUnitResponse::from).toList();
    }

    @Transactional
    public ContractResponse create(SaveContractRequest req, String username) {
        String code = req.code() == null || req.code().isBlank() ? nextCode() : req.code().trim();
        if (repository.existsByCode(code)) throw ApiException.conflict("이미 등록된 계약코드입니다: " + code);
        BillingContract c = BillingContract.builder()
                .contractDate(req.contractDate()).docNo(repository.maxDocNo(req.contractDate()) + 1)
                .code(code).createdBy(username).build();
        apply(c, req);
        repository.save(c);
        return findOne(c.getId());
    }

    @Transactional
    public ContractResponse update(Long id, SaveContractRequest req, String username) {
        BillingContract c = get(id);
        c.setUpdatedBy(username);
        String code = req.code() == null || req.code().isBlank() ? c.getCode() : req.code().trim();
        if (!code.equals(c.getCode()) && repository.existsByCode(code)) throw ApiException.conflict("이미 등록된 계약코드입니다: " + code);
        c.setCode(code);
        if (!c.getContractDate().equals(req.contractDate())) {
            c.setContractDate(req.contractDate());
            c.setDocNo(repository.maxDocNo(req.contractDate()) + 1);
        }
        apply(c, req);
        return findOne(id);
    }

    /** 계약조회 [선택삭제]. */
    @Transactional
    public void delete(List<Long> ids) {
        for (Long id : ids) {
            BillingContract c = get(id);
            if (repository.hasBills(id)) {
                throw ApiException.badRequest("청구예정자료가 생성된 계약은 삭제할 수 없습니다: " + c.getCode());
            }
            repository.delete(c);
        }
    }

    /**
     * 청구자료생성의 [계약] 찾기 — 청구예정월 구간(YYYY-MM) 안에서 계약 줄이 청구되는 달마다 한 줄.
     * 원본 조건: 청구예정월 · 청구단위(필수) · 진행상태(진행중 = 청구기간이 그 달에 걸친 계약).
     * 이미 청구예정자료를 만든 달도 다시 나온다(원본도 같은 달을 두 번 생성하게 둔다 — 2026-10-13 실측).
     */
    @Transactional(readOnly = true)
    public List<BillableLine> billable(YearMonth fromMonth, YearMonth toMonth, List<Long> unitIds, Long partnerId) {
        if (unitIds == null || unitIds.isEmpty()) throw ApiException.badRequest("청구단위를 선택하세요.");
        Set<Long> units = Set.copyOf(unitIds);
        List<BillableLine> out = new ArrayList<>();
        for (BillingContractLine l : repository.findLinesActiveBetween(fromMonth.atDay(1), toMonth.atEndOfMonth())) {
            BillingContract c = l.getContract();
            if (l.getBillingUnit() == null || !units.contains(l.getBillingUnit().getId())) continue;
            if (partnerId != null && !partnerId.equals(c.getPartner().getId())) continue;
            for (YearMonth m = fromMonth; !m.isAfter(toMonth); m = m.plusMonths(1)) {
                if (!l.billsIn(m.getMonthValue())) continue;
                if (c.getBillEnd().isBefore(m.atDay(1)) || c.getBillStart().isAfter(m.atEndOfMonth())) continue;
                out.add(new BillableLine(l.getId(), c.getId(), c.getContractDate(), c.getDocNo(), c.getCode(), c.getName(),
                        c.getPartner().getId(), c.getPartner().getName(), l.getItem().getCode(), l.getItem().getName(),
                        m.toString(), l.getBillMonths(), l.getQuantity(), l.getUnitPrice(), l.getSupplyAmount(), l.getVatAmount(),
                        l.getBillingUnit().getId(), l.getBillingUnit().getCode(), l.getBillingUnit().getName(), l.getRemark()));
            }
        }
        return out;
    }

    /** 청구예정자료 쪽이 계약 줄을 얻는 진입점. */
    @Transactional(readOnly = true)
    public List<BillingContractLine> lines(List<Long> ids) {
        return ids.isEmpty() ? List.of() : repository.findLinesById(ids);
    }

    private BillingContract get(Long id) {
        return repository.findById(id).orElseThrow(() -> ApiException.notFound("계약을 찾을 수 없습니다. id=" + id));
    }

    private List<ContractResponse> withLines(List<BillingContract> cs) {
        if (cs.isEmpty()) return List.of();
        Map<Long, List<BillingContractLine>> by = repository.findLinesOf(cs.stream().map(BillingContract::getId).toList())
                .stream().collect(Collectors.groupingBy((l) -> l.getContract().getId()));
        return cs.stream().map((c) -> ContractResponse.from(c, by.getOrDefault(c.getId(), List.of()))).toList();
    }

    private void apply(BillingContract c, SaveContractRequest req) {
        if (req.billEnd().isBefore(req.billStart())) throw ApiException.badRequest("청구종료일이 청구시작일보다 빠를 수 없습니다.");
        c.setName(req.name());
        c.setPartner(partnerService.get(req.partnerId()));
        c.setBillStart(req.billStart());
        c.setBillEnd(req.billEnd());
        c.setVatType(req.vatType());
        c.setForeignCurrency(req.foreignCurrency());
        c.setEmployeeId(req.employeeId());
        c.setDepartmentId(req.departmentId());
        c.setProject(req.projectId() != null ? projectService.get(req.projectId()) : null);
        c.setRemark(req.remark());
        if (c.getId() != null && repository.hasBills(c.getId())) {
            throw ApiException.badRequest("청구예정자료가 생성된 계약은 줄을 고칠 수 없습니다 — 청구예정자료를 먼저 지우세요.");
        }
        c.getLines().clear();
        int no = 1;
        for (SaveLine l : req.lines()) {
            BigDecimal qty = nz(l.quantity());
            BigDecimal price = nz(l.unitPrice());
            BigDecimal supply = l.supplyAmount() != null ? l.supplyAmount() : qty.multiply(price).setScale(0, RoundingMode.HALF_UP);
            BigDecimal vat = l.vatAmount() != null ? l.vatAmount() : supply.multiply(BigDecimal.valueOf(0.1)).setScale(0, RoundingMode.DOWN);
            c.getLines().add(BillingContractLine.builder()
                    .contract(c).lineNo(no++).item(itemService.get(l.itemId()))
                    .billMonths(l.billMonths() != null ? l.billMonths() : "")
                    .quantity(qty).unitPrice(price).supplyAmount(supply).vatAmount(vat)
                    .billingUnit(unitRepository.findById(l.billingUnitId())
                            .orElseThrow(() -> ApiException.notFound("청구단위를 찾을 수 없습니다. id=" + l.billingUnitId())))
                    .remark(l.remark()).build());
        }
    }

    private static BigDecimal nz(BigDecimal v) {
        return v != null ? v : BigDecimal.ZERO;
    }
}
