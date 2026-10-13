package com.erp.accounting.contractbill;

import com.erp.accounting.billingcontract.BillingContractLine;
import com.erp.accounting.billingcontract.BillingContractService;
import com.erp.accounting.contractbill.dto.ContractBillDtos.BillLine;
import com.erp.accounting.contractbill.dto.ContractBillDtos.BillResponse;
import com.erp.accounting.contractbill.dto.ContractBillDtos.CreateBillRequest;
import com.erp.common.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 회계 II › 계약관리 › 청구예정자료생성(E060905) — 2026-10-13 loginaa 실측.
 *
 * <p>[신규] → 청구자료생성 창(일자 · 부가세유형 · 청구단위) → [계약] 으로 계약현황을 찾아 줄을 불러와 [일괄생성](한 장) ·
 * [거래처별생성](거래처마다 한 장). 같은 달을 다시 생성해도 막지 않는다(원본 -1 · -2 둘 다 생김).
 * 번호를 누르면 청구자료수정 창(저장 · 닫기 · 삭제) — 삭제 확인 '전표를 삭제하겠습니까?'.
 * 회계반영 · 판매생성이 끝난 자료는 고치거나 지울 수 없게 막는다(그 단계는 아직 우리에게 없다).
 */
@Service
@RequiredArgsConstructor
public class ContractBillService {

    private final ContractBillRepository repository;
    private final BillingContractService contractService;

    @Transactional(readOnly = true)
    public List<BillResponse> findAll(LocalDate from, LocalDate to) {
        List<ContractBill> bills = repository.findInPeriod(
                from != null ? from : LocalDate.of(1900, 1, 1), to != null ? to : LocalDate.of(9999, 12, 31));
        return withLines(bills);
    }

    @Transactional(readOnly = true)
    public BillResponse findOne(Long id) {
        return withLines(List.of(get(id))).get(0);
    }

    @Transactional
    public List<BillResponse> create(CreateBillRequest req, String username) {
        Map<Long, BillingContractLine> cls = contractLines(req.lines());
        Map<Long, List<BillLine>> groups = new LinkedHashMap<>();
        for (BillLine l : req.lines()) {
            Long key = req.byPartner() ? cls.get(l.contractLineId()).getContract().getPartner().getId() : 0L;
            groups.computeIfAbsent(key, (k) -> new ArrayList<>()).add(l);
        }
        List<Long> ids = new ArrayList<>();
        int no = repository.maxDocNo(req.billDate());
        for (List<BillLine> g : groups.values()) {
            ContractBill b = ContractBill.builder().billDate(req.billDate()).docNo(++no).vatType(req.vatType()).createdBy(username).build();
            fill(b, g, cls);
            ids.add(repository.save(b).getId());
        }
        return withLines(repository.findAllById(ids));
    }

    @Transactional
    public BillResponse update(Long id, List<BillLine> lines) {
        ContractBill b = get(id);
        requireOpen(b);
        b.getLines().clear();
        repository.flush();
        fill(b, lines, contractLines(lines));
        return findOne(id);
    }

    @Transactional
    public void delete(List<Long> ids) {
        for (Long id : ids) {
            ContractBill b = get(id);
            requireOpen(b);
            repository.delete(b);
        }
    }

    private static void requireOpen(ContractBill b) {
        if (b.isAccountingReflected() || b.isSalesCreated()) {
            throw ApiException.badRequest("회계반영 · 판매생성된 청구자료는 고치거나 지울 수 없습니다.");
        }
    }

    private Map<Long, BillingContractLine> contractLines(List<BillLine> lines) {
        List<Long> ids = lines.stream().map(BillLine::contractLineId).distinct().toList();
        Map<Long, BillingContractLine> m = contractService.lines(ids).stream()
                .collect(Collectors.toMap(BillingContractLine::getId, Function.identity()));
        for (Long id : ids) if (!m.containsKey(id)) throw ApiException.notFound("계약 줄을 찾을 수 없습니다. id=" + id);
        return m;
    }

    private static void fill(ContractBill b, List<BillLine> lines, Map<Long, BillingContractLine> cls) {
        int no = 1;
        for (BillLine l : lines) {
            BillingContractLine cl = cls.get(l.contractLineId());
            b.getLines().add(ContractBillLine.builder().bill(b).lineNo(no++).contractLine(cl).billMonth(l.billMonth())
                    .quantity(or(l.quantity(), cl.getQuantity())).unitPrice(or(l.unitPrice(), cl.getUnitPrice()))
                    .supplyAmount(or(l.supplyAmount(), cl.getSupplyAmount())).vatAmount(or(l.vatAmount(), cl.getVatAmount()))
                    .remark(l.remark()).build());
        }
    }

    private static BigDecimal or(BigDecimal v, BigDecimal d) {
        return v != null ? v : d;
    }

    private ContractBill get(Long id) {
        return repository.findById(id).orElseThrow(() -> ApiException.notFound("청구자료를 찾을 수 없습니다. id=" + id));
    }

    private List<BillResponse> withLines(List<ContractBill> bills) {
        if (bills.isEmpty()) return List.of();
        Map<Long, List<ContractBillLine>> by = repository.findLinesOf(bills.stream().map(ContractBill::getId).toList())
                .stream().collect(Collectors.groupingBy((l) -> l.getBill().getId()));
        return bills.stream()
                .sorted((a, c) -> a.getBillDate().equals(c.getBillDate()) ? c.getDocNo() - a.getDocNo() : c.getBillDate().compareTo(a.getBillDate()))
                .map((b) -> BillResponse.from(b, by.getOrDefault(b.getId(), List.of()))).toList();
    }
}
